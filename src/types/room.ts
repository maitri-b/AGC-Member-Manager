// Room Settings Type Definitions
// For event room allocation and display settings

/**
 * Room Settings - Event-level configuration
 * Controls visibility of room numbers to members
 */
export interface RoomSettings {
  showRoomNumbersToMembers: boolean; // Whether members can see their assigned room numbers
  roomActive: boolean; // Feature visibility toggle for members
}
