import { Contact } from "@prisma/client";

export interface ConsolidatedContact {
  primaryContactId: number;
  emails: string[];
  phoneNumbers: string[];
  secondaryContactIds: number[];
}

export function consolidateContactInfo(
  primaries: Contact[],
  secondaries: Contact[]
): ConsolidatedContact {
  
  if (primaries.length === 0) {
    throw new Error("At least one primary contact is required");
  }
  
  if (primaries.length > 1) {
    console.warn("Multiple primary contacts provided, using the first one");
  }

  const primary = primaries[0];
  

  const allEmails = [primary.email, ...secondaries.map((s) => s.email)]
    .filter((email): email is string => Boolean(email));
  
    
  const allPhoneNumbers = [primary.phoneNumber, ...secondaries.map((s) => s.phoneNumber)]
    .filter((phone): phone is string => Boolean(phone));

 
  const uniqueEmails = Array.from(new Set(allEmails));
  const uniquePhoneNumbers = Array.from(new Set(allPhoneNumbers));

  return {
    primaryContactId: primary.id,
    emails: uniqueEmails.sort((a, b) => a.localeCompare(b)),
    phoneNumbers: uniquePhoneNumbers.sort((a, b) => a.localeCompare(b)),
    secondaryContactIds: secondaries.map((s) => s.id),
  };
}