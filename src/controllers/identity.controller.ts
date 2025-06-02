import { NextFunction, Request, Response } from "express";
import { PrismaClient, Contact } from "@prisma/client";
import { consolidateContactInfo } from "../utils/contact.utils";

const prisma = new PrismaClient();

function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 254;
}

function isValidPhoneNumber(phoneNumber: string): boolean {
  const digitsOnly = phoneNumber.replace(/\D/g, "");
  if (digitsOnly.length < 10 || digitsOnly.length > 13) {
    return false;
  }
  const phoneRegex =
    /^[\+]?[1-9][\d]{0,3}[-.\s]?(\(?\d{1,4}\)?[-.\s]?)?\d{1,4}[-.\s]?\d{1,9}$/;
  return phoneRegex.test(phoneNumber);
}

function validateContactData(
  email?: string,
  phoneNumber?: string
): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!email && !phoneNumber) {
    errors.push("Either email or phoneNumber must be provided");
    return { isValid: false, errors };
  }
  if (email) {
    if (typeof email !== "string") {
      errors.push("Email must be a string");
    } else if (email.trim().length === 0) {
      errors.push("Email cannot be empty");
    } else if (!isValidEmail(email.trim())) {
      errors.push("Invalid email format");
    }
  }
  if (phoneNumber) {
    if (typeof phoneNumber !== "string") {
      errors.push("Phone number must be a string");
    } else if (phoneNumber.trim().length === 0) {
      errors.push("Phone number cannot be empty");
    } else if (!isValidPhoneNumber(phoneNumber.trim())) {
      errors.push(
        "Invalid phone number format. Must be 10-13 digits with optional formatting"
      );
    }
  }
  return { isValid: errors.length === 0, errors };
}

async function findRootPrimary(contactId: number): Promise<Contact> {
  let currentContact = await prisma.contact.findUniqueOrThrow({
    where: { id: contactId },
  });
  while (
    currentContact.linkPrecedence === "secondary" &&
    currentContact.linkedId
  ) {
    currentContact = await prisma.contact.findUniqueOrThrow({
      where: { id: currentContact.linkedId },
    });
  }
  return currentContact;
}

async function updateContactTree(
  oldPrimaryId: number,
  newPrimaryId: number
): Promise<void> {
  const allLinkedContacts = await prisma.contact.findMany({
    where: {
      OR: [{ linkedId: oldPrimaryId }, { id: oldPrimaryId }],
    },
  });

  const secondaryIds = allLinkedContacts
    .filter((c) => c.linkPrecedence === "secondary")
    .map((c) => c.id);

  let additionalContacts: Contact[] = [];
  if (secondaryIds.length > 0) {
    additionalContacts = await prisma.contact.findMany({
      where: {
        linkedId: { in: secondaryIds },
      },
    });
  }

  const allContactsToUpdate = [...allLinkedContacts, ...additionalContacts];
  const uniqueContactsToUpdate = Array.from(
    new Map(allContactsToUpdate.map((c) => [c.id, c])).values()
  ).filter((c) => c.id !== newPrimaryId);

  if (uniqueContactsToUpdate.length > 0) {
    await prisma.$transaction([
      prisma.contact.updateMany({
        where: {
          id: { in: uniqueContactsToUpdate.map((c) => c.id) },
        },
        data: {
          linkedId: newPrimaryId,
          linkPrecedence: "secondary",
          updatedAt: new Date(),
        },
      }),
    ]);
  }
}

export const root = async (req: Request, res: Response) => {
  res.json({
    service: "Identity Reconciliation API",
    version: "1.0.0",
    endpoints: {
      identify: "POST /api/identify",
    },
    documentation: "https://github.com/saumay3105/Identity_Reconciliation",
  });
};

export const identifyContact = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { email, phoneNumber } = req.body;
  const validation = validateContactData(email, phoneNumber);
  if (!validation.isValid) {
    return res.status(400).json({
      error: "Validation failed",
      details: validation.errors,
    });
  }
  const normalizedEmail = email?.trim().toLowerCase();
  const normalizedPhoneNumber = phoneNumber?.trim();
  try {
    const matchingContacts = await prisma.contact.findMany({
      where: {
        OR: [
          ...(normalizedEmail ? [{ email: normalizedEmail }] : []),
          ...(normalizedPhoneNumber
            ? [{ phoneNumber: normalizedPhoneNumber }]
            : []),
        ],
      },
    });
    if (matchingContacts.length === 0) {
      const newPrimary = await prisma.contact.create({
        data: {
          email: normalizedEmail,
          phoneNumber: normalizedPhoneNumber,
          linkPrecedence: "primary",
        },
      });
      return res.json({ contact: consolidateContactInfo([newPrimary], []) });
    }
    const rootPrimaries = await Promise.all(
      matchingContacts.map((c) => findRootPrimary(c.id))
    );
    const uniquePrimaries = Array.from(
      new Map(rootPrimaries.map((p) => [p.id, p])).values()
    ).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const mainPrimary = uniquePrimaries[0];
    if (uniquePrimaries.length > 1) {
      await Promise.all(
        uniquePrimaries.slice(1).map(async (oldPrimary) => {
          await updateContactTree(oldPrimary.id, mainPrimary.id);
        })
      );
    }
    const existingLinked = await prisma.contact.findMany({
      where: {
        OR: [{ id: mainPrimary.id }, { linkedId: mainPrimary.id }],
      },
    });
    const exactMatch = existingLinked.find(
      (c) =>
        c.email === normalizedEmail && c.phoneNumber === normalizedPhoneNumber
    );
    if (!exactMatch) {
      await prisma.contact.create({
        data: {
          email: normalizedEmail,
          phoneNumber: normalizedPhoneNumber,
          linkedId: mainPrimary.id,
          linkPrecedence: "secondary",
        },
      });
    }
    const updatedContacts = await prisma.contact.findMany({
      where: {
        OR: [{ id: mainPrimary.id }, { linkedId: mainPrimary.id }],
      },
    });
    return res.json({
      contact: consolidateContactInfo(
        updatedContacts.filter((c) => c.linkPrecedence === "primary"),
        updatedContacts.filter((c) => c.linkPrecedence === "secondary")
      ),
    });
  } catch (error) {
    next(error);
  }
};
