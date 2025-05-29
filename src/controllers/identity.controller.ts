import { Request, Response } from 'express';
import { PrismaClient, Contact } from '@prisma/client';
import { consolidateContactInfo } from '../utils/contact.utils';

const prisma = new PrismaClient();


function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 254;
}


function isValidPhoneNumber(phoneNumber: string): boolean {
  
  const digitsOnly = phoneNumber.replace(/\D/g, '');
  
  
  if (digitsOnly.length < 10 || digitsOnly.length > 13) {
    return false;
  }
  
 
  const phoneRegex = /^[\+]?[1-9][\d]{0,3}[-.\s]?(\(?\d{1,4}\)?[-.\s]?)?\d{1,4}[-.\s]?\d{1,9}$/;
  return phoneRegex.test(phoneNumber);
}


function validateContactData(email?: string, phoneNumber?: string): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!email && !phoneNumber) {
    errors.push("Either email or phoneNumber must be provided");
    return { isValid: false, errors };
  }

  if (email) {
    if (typeof email !== 'string') {
      errors.push("Email must be a string");
    } else if (email.trim().length === 0) {
      errors.push("Email cannot be empty");
    } else if (!isValidEmail(email.trim())) {
      errors.push("Invalid email format");
    }
  }

  if (phoneNumber) {
    if (typeof phoneNumber !== 'string') {
      errors.push("Phone number must be a string");
    } else if (phoneNumber.trim().length === 0) {
      errors.push("Phone number cannot be empty");
    } else if (!isValidPhoneNumber(phoneNumber.trim())) {
      errors.push("Invalid phone number format. Must be 10-13 digits with optional formatting");
    }
  }

  return { isValid: errors.length === 0, errors };
}

async function findRootPrimary(contactId: number): Promise<Contact> {
  let currentContact = await prisma.contact.findUniqueOrThrow({
    where: { id: contactId }
  });

  while (currentContact.linkPrecedence === 'secondary' && currentContact.linkedId) {
    currentContact = await prisma.contact.findUniqueOrThrow({
      where: { id: currentContact.linkedId }
    });
  }

  return currentContact;
}

export const identifyContact = async (req: Request, res: Response) => {
  const { email, phoneNumber } = req.body;

  
  const validation = validateContactData(email, phoneNumber);
  if (!validation.isValid) {
    return res.status(400).json({ 
      error: "Validation failed", 
      details: validation.errors 
    });
  }

  
  const normalizedEmail = email?.trim().toLowerCase();
  const normalizedPhoneNumber = phoneNumber?.trim();

  try {
    const matchingContacts = await prisma.contact.findMany({
      where: {
        OR: [
          ...(normalizedEmail ? [{ email: normalizedEmail }] : []),
          ...(normalizedPhoneNumber ? [{ phoneNumber: normalizedPhoneNumber }] : [])
        ]
      }
    });

    if (matchingContacts.length === 0) {
      const newPrimary = await prisma.contact.create({
        data: { 
          email: normalizedEmail, 
          phoneNumber: normalizedPhoneNumber, 
          linkPrecedence: 'primary' 
        }
      });
      return res.json({ contact: consolidateContactInfo([newPrimary], []) });
    }

    const rootPrimaries = await Promise.all(
      matchingContacts.map(c => findRootPrimary(c.id))
    );

    const uniquePrimaries = Array.from(new Map(
      rootPrimaries.map(p => [p.id, p])
    ).values()).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    const mainPrimary = uniquePrimaries[0];

    if (uniquePrimaries.length > 1) {
      await prisma.contact.updateMany({
        where: { id: { in: uniquePrimaries.slice(1).map(p => p.id) } },
        data: {
          linkedId: mainPrimary.id,
          linkPrecedence: 'secondary',
          updatedAt: new Date()
        }
      });
    }

    const existingLinked = await prisma.contact.findMany({
      where: {
        OR: [
          { id: mainPrimary.id },
          { linkedId: mainPrimary.id }
        ]
      }
    });

    const exactMatch = existingLinked.find(c =>
      c.email === normalizedEmail && c.phoneNumber === normalizedPhoneNumber
    );

    if (!exactMatch) {
      await prisma.contact.create({
        data: {
          email: normalizedEmail,
          phoneNumber: normalizedPhoneNumber,
          linkedId: mainPrimary.id,
          linkPrecedence: 'secondary'
        }
      });
    }

    const updatedContacts = await prisma.contact.findMany({
      where: {
        OR: [
          { id: mainPrimary.id },
          { linkedId: mainPrimary.id }
        ]
      }
    });

    return res.json({
      contact: consolidateContactInfo(
        updatedContacts.filter(c => c.linkPrecedence === 'primary'),
        updatedContacts.filter(c => c.linkPrecedence === 'secondary')
      )
    });

  } catch (error) {
    console.error('Contact identification error:', error);
    return res.status(500).json({ error: "Internal server error" });
  }
};