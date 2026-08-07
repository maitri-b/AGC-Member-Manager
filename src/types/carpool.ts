// Carpool Types
export interface CarpoolMember {
  registrationId: string;
  lineUserId: string;
  name: string;
  isOwner: boolean;
}

export interface Carpool {
  carpoolId: string;
  eventId: string;
  ownerRegistrationId: string;
  licensePlate: string;
  members: CarpoolMember[];
  assignedCarNumber?: number;
  createdAt: string;
  updatedAt: string;
}

export interface CarpoolSettings {
  totalCarNumbers: number;
  showCarNumbersToMembers: boolean;
  maxSeatsPerCar?: number;
}

export interface CreateCarpoolData {
  eventId: string;
  ownerRegistrationId: string;
  licensePlate: string;
  members: CarpoolMember[];
}

export interface UpdateCarpoolData {
  licensePlate?: string;
  members?: CarpoolMember[];
  assignedCarNumber?: number;
}
