import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { consolidateContactInfo } from '../utils/contact.utils';


const prisma = new PrismaClient();

export const identifyContact = async (req: Request, res: Response) => {
  const { email, phoneNumber } = req.body;

  if (!email && !phoneNumber) {
    return res.status(400).json({ error: "Either email or phoneNumber must be provided" });
  }

  try {
    
    const matchingContacts = await prisma.contact.findMany({
      where: {
        OR: [
          { email: email || undefined },
          { phoneNumber: phoneNumber || undefined }
        ]
      }
    });

    
    let primaryContact = matchingContacts.find(c => c.linkPrecedence === "primary");
    const secondaryContacts = matchingContacts.filter(c => c.linkPrecedence === "secondary");

    
    if (!primaryContact) {
      const newContact = await prisma.contact.create({
        data: {
          email,
          phoneNumber,
          linkPrecedence: "primary"
        }
      });
      return res.json(consolidateContactInfo([newContact], []));
    }

    
    const otherPrimaries = matchingContacts.filter(c => 
      c.linkPrecedence === "primary" && c.id !== primaryContact?.id
    );

    if (otherPrimaries.length > 0) {
      const oldestPrimary = [primaryContact, ...otherPrimaries].sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
      )[0];

      await prisma.contact.updateMany({
        where: {
          id: {
            in: [primaryContact.id, ...otherPrimaries.map(p => p.id)]
          }
        },
        data: {
          linkedId: oldestPrimary.id,
          linkPrecedence: "secondary"
        }
      });

      primaryContact = oldestPrimary;
    }

    if ((email && !matchingContacts.some(c => c.email === email)) ||
        (phoneNumber && !matchingContacts.some(c => c.phoneNumber === phoneNumber))) {
      await prisma.contact.create({
        data: {
          email,
          phoneNumber,
          linkedId: primaryContact.id,
          linkPrecedence: "secondary"
        }
      });
    }

    
    const allContacts = await prisma.contact.findMany({
      where: {
        OR: [
          { id: primaryContact.id },
          { linkedId: primaryContact.id }
        ]
      }
    });

    return res.json(consolidateContactInfo(
      allContacts.filter(c => c.linkPrecedence === "primary"),
      allContacts.filter(c => c.linkPrecedence === "secondary")
    ));

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal server error" });
  }
};
