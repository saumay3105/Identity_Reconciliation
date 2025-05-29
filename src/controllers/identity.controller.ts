import { Request, Response } from 'express';
import { PrismaClient, Contact } from '@prisma/client';
import { consolidateContactInfo } from '../utils/contact.utils';

const prisma = new PrismaClient();

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

  if (!email && !phoneNumber) {
    return res.status(400).json({ error: "Either email or phoneNumber must be provided" });
  }

  try {
    
    const matchingContacts = await prisma.contact.findMany({
      where: {
        OR: [
          ...(email ? [{ email }] : []),
          ...(phoneNumber ? [{ phoneNumber }] : [])
        ]
      }
    });

    
    if (matchingContacts.length === 0) {
      const newPrimary = await prisma.contact.create({
        data: { email, phoneNumber, linkPrecedence: 'primary' }
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
      c.email === email && c.phoneNumber === phoneNumber
    );

    
    if (!exactMatch) {
      await prisma.contact.create({
        data: {
          email,
          phoneNumber,
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
    console.error(error);
    return res.status(500).json({ error: "Internal server error" });
  }
};
