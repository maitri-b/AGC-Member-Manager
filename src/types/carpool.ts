// Carpool Types
export interface CarpoolMember {
  registrationId: string;
  lineUserId: string;
  name: string;
}

export interface Carpool {
  carpoolId: string;
  eventId: string;
  ownerRegistrationId: string;
  licensePlate: string;
  members: CarpoolMember[];
  assignedCarNumber?: number;
  status?: 'active' | 'cancelled' | 'deleted';
  createdAt: string;
  updatedAt: string;
}

export interface CarpoolSettings {
  totalCarNumbers: number;
  showCarNumbersToMembers: boolean;
  maxSeatsPerCar?: number;
  carpoolActive?: boolean; // If false, Carpool is only visible to admin
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
