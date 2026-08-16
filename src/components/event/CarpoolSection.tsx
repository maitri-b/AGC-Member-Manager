'use client';

import { useState, useEffect, useMemo } from 'react';
import { toast } from 'react-hot-toast';

interface CarpoolMember {
  registrationId: string;
  lineUserId: string;
  name: string;
  attendeeIndex: number;
  companyName?: string;
}

interface Carpool {
  carpoolId: string;
  eventId: string;
  ownerRegistrationId: string;
  ownerCompanyName: string;
  licensePlate: string;
  members: CarpoolMember[];
  assignedCarNumber?: number;
  status: string;
}

interface CarpoolSettings {
  showCarNumbersToMembers: boolean;
  carpoolActive: boolean;
}

interface UserRegistration {
  registrationId: string;
  lineUserId: string;
  attendeeNames?: string;
}

interface CarpoolSectionProps {
  eventId: string;
  event: {
    hasCarpoolFeature?: boolean;
    carpoolSettings?: CarpoolSettings;
  };
  userRegistration: UserRegistration | null;
  session: {
    user?: {
      lineUserId?: string;
      role?: string;
    };
  } | null;
  isCommitteeOrAdmin: boolean;
  attendeeNames: string[];
}

export default function CarpoolSection({
  eventId,
  event,
  userRegistration,
  session,
  isCommitteeOrAdmin,
  attendeeNames,
}: CarpoolSectionProps) {
  // State management
  const [memberCarpools, setMemberCarpools] = useState<Carpool[]>([]);
  const [carpoolLoading, setCarpoolLoading] = useState(false);
  const [allCarpoolsLoaded, setAllCarpoolsLoaded] = useState(false);
  const [showCreateCarpoolModal, setShowCreateCarpoolModal] = useState(false);
  const [newCarpoolLicensePlate, setNewCarpoolLicensePlate] = useState('');
  const [selectedMembersForCarpool, setSelectedMembersForCarpool] = useState<number[]>([]);
  const [creatingCarpool, setCreatingCarpool] = useState(false);
  const [invitingToCarpoolId, setInvitingToCarpoolId] = useState<string | null>(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [allCarpools, setAllCarpools] = useState<Carpool[]>([]);
  const [showJoinCarpoolModal, setShowJoinCarpoolModal] = useState(false);
  const [searchRegistrationId, setSearchRegistrationId] = useState('');
  const [searchedRegistration, setSearchedRegistration] = useState<any>(null);
  const [selectedMembersToInvite, setSelectedMembersToInvite] = useState<any[]>([]);
  const [inviting, setInviting] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showCarpoolTooltip, setShowCarpoolTooltip] = useState(false);
  const [showDeleteCarpoolConfirmModal, setShowDeleteCarpoolConfirmModal] = useState(false);
  const [pendingMemberRemoval, setPendingMemberRemoval] = useState<{
    lineUserId: string;
    name: string;
    carpoolId: string;
  } | null>(null);
  const [editingLicensePlate, setEditingLicensePlate] = useState(false);
  const [newLicensePlate, setNewLicensePlate] = useState('');
  const [savingLicensePlate, setSavingLicensePlate] = useState(false);

  // Derived state
  const ownedCarpools = memberCarpools.filter(
    (cp) => cp.ownerRegistrationId === userRegistration?.registrationId
  );
  const joinedCarpools = memberCarpools.filter(
    (cp) => cp.ownerRegistrationId !== userRegistration?.registrationId
  );
  const memberCarpool = ownedCarpools[0] || null;

  // Debug: Log owned carpools whenever they change
  useEffect(() => {
    if (ownedCarpools.length > 0) {
      console.log('[Owned Carpools Debug]', ownedCarpools.map(cp => ({
        carpoolId: cp.carpoolId,
        licensePlate: cp.licensePlate,
        assignedCarNumber: cp.assignedCarNumber,
        assignedCarNumberType: typeof cp.assignedCarNumber,
        members: cp.members?.length || 0,
      })));
    }
  }, [ownedCarpools]);

  // Fetch member carpools on mount and when dependencies change
  useEffect(() => {
    console.log('[CarpoolSection] useEffect triggered', {
      hasCarpoolFeature: event?.hasCarpoolFeature,
      hasUserRegistration: !!userRegistration,
      willFetch: !!(event?.hasCarpoolFeature && userRegistration)
    });
    if (event?.hasCarpoolFeature && userRegistration) {
      console.log('[CarpoolSection] Calling fetchMemberCarpool...');
      fetchMemberCarpool();
      fetchAllCarpools(); // Also fetch all carpools to validate member status
    }
  }, [event?.hasCarpoolFeature, userRegistration]);

  // API functions
  const fetchMemberCarpool = async () => {
    console.log('[CarpoolSection] fetchMemberCarpool called', {
      hasCarpoolFeature: event?.hasCarpoolFeature,
      hasUserRegistration: !!userRegistration,
      eventId
    });

    if (!event?.hasCarpoolFeature || !userRegistration) {
      console.log('[CarpoolSection] Skipping fetch - conditions not met');
      return;
    }

    setCarpoolLoading(true);
    try {
      console.log('[CarpoolSection API] Calling:', `/api/events/${eventId}/my-carpool`);
      const response = await fetch(`/api/events/${eventId}/my-carpool`);
      console.log('[CarpoolSection API] Response status:', response.status, response.ok);
      if (response.ok) {
        const data = await response.json();
        console.log('[CarpoolSection API] Full Response:', JSON.stringify(data.carpools, null, 2));
        setMemberCarpools(data.carpools || []);
        console.log('[CarpoolSection API] Set memberCarpools, count:', data.carpools?.length);
      } else {
        console.error('[CarpoolSection API] Failed with status:', response.status);
        const errorData = await response.json().catch(() => ({}));
        console.error('[CarpoolSection API] Error data:', errorData);
      }
    } catch (err) {
      console.error('Error fetching member carpools:', err);
    } finally {
      setCarpoolLoading(false);
    }
  };

  const fetchAllCarpools = async () => {
    if (!eventId) return;

    try {
      const response = await fetch(`/api/events/${encodeURIComponent(eventId)}/carpools`);
      if (response.ok) {
        const data = await response.json();
        const activeCarpools = (data.carpools || []).filter(
          (cp: any) => cp.status !== 'deleted' && cp.status !== 'cancelled'
        );
        setAllCarpools(activeCarpools);
        setAllCarpoolsLoaded(true);
      }
    } catch (err) {
      console.error('Error fetching all carpools:', err);
      setAllCarpoolsLoaded(true); // Set to true even on error to prevent infinite loading
    }
  };

  // Handler functions
  const handleCreateCarpool = async () => {
    if (!newCarpoolLicensePlate.trim()) {
      toast.error('กรุณาระบุเลขทะเบียนรถ');
      return;
    }

    if (selectedMembersForCarpool.length === 0) {
      toast.error('กรุณาเลือกสมาชิกในรถอย่างน้อย 1 คน');
      return;
    }

    if (!userRegistration?.registrationId) {
      toast.error('ไม่พบข้อมูลการลงทะเบียน');
      return;
    }

    setCreatingCarpool(true);
    try {
      const members = selectedMembersForCarpool.map((index) => ({
        registrationId: userRegistration.registrationId,
        lineUserId: session?.user?.lineUserId || '',
        name: attendeeNames[index] || '',
        attendeeIndex: index,
      }));

      const response = await fetch('/api/carpools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId,
          ownerRegistrationId: userRegistration.registrationId,
          licensePlate: newCarpoolLicensePlate,
          members,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create carpool');
      }

      toast.success('ลงทะเบียนรถยนต์สำเร็จ!');
      setShowCreateCarpoolModal(false);
      setNewCarpoolLicensePlate('');
      setSelectedMembersForCarpool([]);

      await fetchMemberCarpool();
      await fetchAllCarpools();
    } catch (err) {
      console.error('Error creating carpool:', err);
      toast.error(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการลงทะเบียนรถยนต์');
    } finally {
      setCreatingCarpool(false);
    }
  };

  const handleDeleteCarpool = async (carpoolId: string) => {
    if (!confirm('คุณแน่ใจหรือไม่ว่าต้องการลบ Carpool นี้? การกระทำนี้ไม่สามารถย้อนกลับได้')) {
      return;
    }

    try {
      const response = await fetch(`/api/carpools/${carpoolId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete carpool');
      }

      toast.success('ลบ Carpool สำเร็จ!');
      await fetchMemberCarpool();
      await fetchAllCarpools();
    } catch (err) {
      console.error('Error deleting carpool:', err);
      toast.error(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการลบ Carpool');
    }
  };

  const handleRemoveTeamMember = async (lineUserId: string, name: string, carpoolId?: string) => {
    const targetCarpoolId = carpoolId || memberCarpool?.carpoolId;

    if (!targetCarpoolId) {
      toast.error('ไม่พบข้อมูล Carpool');
      return;
    }

    const targetCarpool = memberCarpools.find((cp) => cp.carpoolId === targetCarpoolId);

    if (!targetCarpool) {
      toast.error('ไม่พบข้อมูล Carpool');
      return;
    }

    const remainingMembers = targetCarpool.members.filter(
      (m: any) => !(m.lineUserId === lineUserId && m.name === name)
    );

    if (remainingMembers.length === 0) {
      setPendingMemberRemoval({ lineUserId, name, carpoolId: targetCarpoolId });
      setShowDeleteCarpoolConfirmModal(true);
      return;
    }

    if (!confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบ "${name}" ออกจากทะเบียนรถคันนี้?`)) {
      return;
    }

    await executeRemoveMember(targetCarpoolId, lineUserId, name);
  };

  const executeRemoveMember = async (carpoolId: string, lineUserId: string, name: string) => {
    try {
      const response = await fetch(`/api/carpools/${carpoolId}/remove-members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          members: [{ lineUserId, name }],
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to remove member');
      }

      toast.success(`ลบ ${name} ออกจากทะเบียนรถสำเร็จ`);
      await fetchMemberCarpool();
      await fetchAllCarpools();
    } catch (err) {
      console.error('Error removing team member:', err);
      toast.error(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการลบสมาชิก');
    }
  };

  const handleConfirmDeleteCarpool = async () => {
    if (!pendingMemberRemoval) return;

    await executeRemoveMember(
      pendingMemberRemoval.carpoolId,
      pendingMemberRemoval.lineUserId,
      pendingMemberRemoval.name
    );

    setShowDeleteCarpoolConfirmModal(false);
    setPendingMemberRemoval(null);
  };

  // Don't render if carpool feature is disabled
  if (!event.hasCarpoolFeature) {
    return null;
  }

  // Don't render if carpoolActive is false and user is not admin/committee
  if (event.carpoolSettings?.carpoolActive === false && !isCommitteeOrAdmin) {
    return null;
  }

  // Calculate members not in any carpool - use useMemo to recalculate when dependencies change
  const membersNotInCarpool = useMemo(() => {
    // Don't calculate until allCarpools is loaded
    if (!allCarpoolsLoaded) {
      return attendeeNames; // Assume all not in carpool until we know
    }

    return attendeeNames.filter((name, index) => {
      let isInCarpool = false;

      allCarpools.forEach((cp) => {
        const member = cp.members?.find((m: any) => {
          if (m.registrationId !== userRegistration?.registrationId) {
            return false;
          }

          if (m.attendeeIndex !== undefined && m.attendeeIndex !== -1) {
            return m.attendeeIndex === index;
          }

          const normalizeName = (n: string) => n.replace(/\s+/g, ' ').trim();
          const cleanName = m.name.replace(/^\["|"\]$/g, '').replace(/^['"]|['"]$/g, '');
          return (
            normalizeName(cleanName) === normalizeName(name) ||
            normalizeName(m.name) === normalizeName(name)
          );
        });
        if (member) {
          isInCarpool = true;
        }
      });

      return !isInCarpool;
    });
  }, [allCarpools, allCarpoolsLoaded, attendeeNames, userRegistration?.registrationId]);

  const allMembersInCarpools = allCarpoolsLoaded && membersNotInCarpool.length === 0;
  const ownedCarpoolsCount = ownedCarpools.length;

  return (
    <div id="carpool-section" className="bg-white border border-gray-300 rounded-lg p-4 mb-6 scroll-mt-24">
      <div>
        <div className="mb-4">
          {/* Header */}
          <div className="mb-3">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-base font-semibold text-gray-900">
                🚗 การลงทะเบียนรถยนต์ และลงชื่อไปด้วยกัน (Carpool)
              </h3>
              <div className="relative">
                <button
                  type="button"
                  onMouseEnter={() => setShowCarpoolTooltip(true)}
                  onMouseLeave={() => setShowCarpoolTooltip(false)}
                  onClick={() => setShowCarpoolTooltip(!showCarpoolTooltip)}
                  className="text-blue-500 hover:text-blue-700 transition-colors"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
                {showCarpoolTooltip && (
                  <div className="absolute left-0 top-6 z-50 w-80 p-4 bg-white border-2 border-blue-300 rounded-lg shadow-xl">
                    <div className="space-y-3 text-xs text-gray-700">
                      <div>
                        <p className="font-semibold text-blue-700 mb-1">
                          🚗 การลงชื่อไปด้วยกัน (Carpool)
                        </p>
                        <p>
                          ระบบลงทะเบียนรถและลงชื่อไปด้วยกันเพื่อให้เอเจ้นท์เดินทางไปงานร่วมกัน
                          ช่วยลดค่าใช้จ่ายและสะดวกในการจัดการที่จอดรถ
                        </p>
                      </div>
                      <div className="pt-2 border-t border-gray-200">
                        <p className="font-semibold text-green-700 mb-1">
                          📝 วิธีลงทะเบียนรถยนต์ (สำหรับเจ้าของรถ)
                        </p>
                        <ol className="list-decimal list-inside space-y-1 ml-2">
                          <li>กดปุ่ม "ลงทะเบียนรถยนต์"</li>
                          <li>กรอกเลขทะเบียนรถของคุณ</li>
                          <li>เลือกสมาชิกในทีมที่จะนั่งรถคุณ</li>
                          <li>กดยืนยัน - เสร็จสิ้น!</li>
                        </ol>
                      </div>
                      <div className="pt-2 border-t border-gray-200 bg-yellow-50 -mx-4 -mb-4 p-3 rounded-b-lg">
                        <p className="text-yellow-800 font-medium">💡 ข้อควรทราบ:</p>
                        <ul className="list-disc list-inside space-y-0.5 ml-2 mt-1 text-yellow-700">
                          <li>สมาชิก 1 คนสามารถอยู่ได้แค่ 1 รถเท่านั้น</li>
                          <li>สามารถแก้ไขเลขทะเบียนได้โดยกดปุ่ม "✏️ แก้ไข"</li>
                          <li>1 เอเจ้นท์สามารถลงทะเบียนได้มากกว่า 1 คัน</li>
                          <li>
                            หากต้องการดูขั้นตอนโดยละเอียด{' '}
                            <a
                              href="/carpool-guide"
                              target="_blank"
                              className="text-blue-600 hover:underline font-semibold"
                            >
                              คลิกที่นี่
                            </a>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
            {/* Inactive Warning */}
            {event.carpoolSettings?.carpoolActive === false && isCommitteeOrAdmin && (
              <div className="mt-2">
                <span className="text-xs px-2 py-0.5 bg-yellow-100 text-yellow-800 rounded-full font-medium border border-yellow-300">
                  ⚠️ ระบบปิดใช้งาน - เห็นเฉพาะ Admin/Committee
                </span>
              </div>
            )}
          </div>

          {/* Description - Travel Method Selection */}
          <div className="mb-4 p-4 bg-gradient-to-r from-blue-50 to-green-50 border border-gray-300 rounded-lg">
            <p className="text-sm font-semibold text-gray-800 mb-3">เลือกวิธีเดินทางของคุณ:</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Option 1: Drive own car */}
              <button
                onClick={() => !allMembersInCarpools && setShowCreateCarpoolModal(true)}
                disabled={allMembersInCarpools}
                className={`flex items-start gap-3 p-3 border-2 rounded-lg transition-all text-left group ${
                  allMembersInCarpools
                    ? 'bg-gray-100 border-gray-300 cursor-not-allowed'
                    : 'bg-white border-blue-300 hover:border-blue-500 hover:shadow-md'
                }`}
              >
                <div className="text-3xl mt-1">🚗</div>
                <div className="flex-1">
                  <p
                    className={`font-semibold transition-colors ${
                      allMembersInCarpools
                        ? 'text-gray-500'
                        : 'text-gray-900 group-hover:text-blue-700'
                    }`}
                  >
                    ขับรถไปเอง
                  </p>
                  <p className={`text-xs mt-1 ${allMembersInCarpools ? 'text-gray-400' : 'text-gray-600'}`}>
                    คุณสามารถลงทะเบียนรถยนต์ได้มากกว่า 1 คัน
                  </p>
                  <div
                    className={`mt-2 inline-block px-3 py-1 text-xs rounded-lg transition-colors ${
                      allMembersInCarpools
                        ? 'bg-gray-300 text-gray-500'
                        : 'bg-blue-600 text-white group-hover:bg-blue-700'
                    }`}
                  >
                    {allMembersInCarpools
                      ? 'ลงทะเบียนรถยนต์'
                      : ownedCarpoolsCount === 0
                      ? 'ลงทะเบียนรถยนต์'
                      : `ลงทะเบียนรถยนต์ คันที่ ${ownedCarpoolsCount + 1}`}
                  </div>
                </div>
              </button>

              {/* Option 2: Join other's car */}
              <button
                onClick={() => {
                  if (!allMembersInCarpools) {
                    setShowJoinCarpoolModal(true);
                    if (allCarpools.length === 0) {
                      fetchAllCarpools();
                    }
                  }
                }}
                disabled={allMembersInCarpools}
                className={`flex items-start gap-3 p-3 border-2 rounded-lg transition-all text-left group ${
                  allMembersInCarpools
                    ? 'bg-gray-100 border-gray-300 cursor-not-allowed'
                    : 'bg-white border-green-300 hover:border-green-500 hover:shadow-md'
                }`}
              >
                <div className="text-3xl mt-1">🚐</div>
                <div className="flex-1">
                  <p
                    className={`font-semibold transition-colors ${
                      allMembersInCarpools
                        ? 'text-gray-500'
                        : 'text-gray-900 group-hover:text-green-700'
                    }`}
                  >
                    ไปรถคนอื่น
                  </p>
                  <p className={`text-xs mt-1 ${allMembersInCarpools ? 'text-gray-400' : 'text-gray-600'}`}>
                    ต้องมีรหัสการจอง 6 หลัก ของรถที่คุณขอ Join
                  </p>
                  <div
                    className={`mt-2 inline-block px-3 py-1 text-xs rounded-lg transition-colors ${
                      allMembersInCarpools
                        ? 'bg-gray-300 text-gray-500'
                        : 'bg-green-600 text-white group-hover:bg-green-700'
                    }`}
                  >
                    เลือกรถที่ร่วม Join
                  </div>
                </div>
              </button>
            </div>

            {/* Message when all members selected travel method */}
            {allMembersInCarpools && (
              <div className="mt-3 p-2 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-xs text-green-700 text-center font-medium">
                  ✅ สมาชิกในทีมเลือกวิธีเดินทางครบแล้ว
                </p>
              </div>
            )}

            {/* Warning when some members haven't specified transportation */}
            {!allMembersInCarpools && allCarpoolsLoaded && ownedCarpoolsCount > 0 && membersNotInCarpool.length > 0 && (
              <div className="mt-3 p-2 bg-orange-50 border border-orange-300 rounded-lg">
                <p className="text-xs text-orange-800 text-center font-medium">
                  ⚠️ มีสมาชิกในทีม {membersNotInCarpool.length} คน ยังไม่ระบุวิธีเดินทาง
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Carpool List */}
        {carpoolLoading ? (
          <div className="px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-center text-gray-500">
            กำลังโหลด...
          </div>
        ) : memberCarpools.length > 0 ? (
          <div className="space-y-3">
            {/* Owned Carpools Section */}
            {ownedCarpools.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-blue-700 mb-2">
                  ทะเบียนรถของคุณ ({ownedCarpools.length} คัน)
                </p>
                <div className="space-y-2">
                  {ownedCarpools.map((ownedCarpool) => (
                    <div
                      key={ownedCarpool.carpoolId}
                      className="px-4 py-3 bg-blue-50 border border-blue-300 rounded-lg"
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            {editingLicensePlate ? (
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={newLicensePlate}
                                  onChange={(e) => setNewLicensePlate(e.target.value)}
                                  placeholder="เลขทะเบียนรถ"
                                  className="px-3 py-1 text-sm border border-blue-300 rounded focus:ring-2 focus:ring-blue-500"
                                />
                                <button
                                  onClick={async () => {
                                    if (!newLicensePlate.trim()) {
                                      toast.error('กรุณาระบุเลขทะเบียนรถ');
                                      return;
                                    }

                                    setSavingLicensePlate(true);
                                    try {
                                      const response = await fetch(
                                        `/api/carpools/${ownedCarpool.carpoolId}`,
                                        {
                                          method: 'PUT',
                                          headers: { 'Content-Type': 'application/json' },
                                          body: JSON.stringify({ licensePlate: newLicensePlate }),
                                        }
                                      );

                                      if (!response.ok) {
                                        throw new Error('Failed to update license plate');
                                      }

                                      toast.success('แก้ไขเลขทะเบียนรถสำเร็จ!');
                                      setEditingLicensePlate(false);
                                      await fetchMemberCarpool();
                                    } catch (err) {
                                      console.error('Error updating license plate:', err);
                                      toast.error('เกิดข้อผิดพลาดในการแก้ไขเลขทะเบียนรถ');
                                    } finally {
                                      setSavingLicensePlate(false);
                                    }
                                  }}
                                  disabled={savingLicensePlate}
                                  className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-300"
                                >
                                  {savingLicensePlate ? 'กำลังบันทึก...' : 'บันทึก'}
                                </button>
                                <button
                                  onClick={() => {
                                    setEditingLicensePlate(false);
                                    setNewLicensePlate(ownedCarpool.licensePlate);
                                  }}
                                  className="px-3 py-1 text-xs bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
                                >
                                  ยกเลิก
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <p className="text-lg font-semibold text-blue-900">
                                  เลขทะเบียน: {ownedCarpool.licensePlate}
                                </p>
                                <button
                                  onClick={() => {
                                    setEditingLicensePlate(true);
                                    setNewLicensePlate(ownedCarpool.licensePlate);
                                  }}
                                  className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
                                >
                                  ✏️ แก้ไข
                                </button>
                                <button
                                  onClick={() => handleDeleteCarpool(ownedCarpool.carpoolId)}
                                  className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors"
                                >
                                  🗑️ ลบ
                                </button>
                              </div>
                            )}
                            <p className="text-xs text-blue-700">
                              เจ้าของ: {ownedCarpool.ownerCompanyName}
                            </p>
                          </div>
                          {ownedCarpool.assignedCarNumber &&
                            event.carpoolSettings?.showCarNumbersToMembers && (
                              <div className="text-right">
                                <p className="text-xs text-blue-600">เลขรถ</p>
                                <p className="text-lg font-bold text-blue-900">
                                  {ownedCarpool.assignedCarNumber}
                                </p>
                              </div>
                            )}
                        </div>
                        <div className="text-xs text-blue-700">
                          จำนวนสมาชิกร่วมรถคันนี้: {ownedCarpool.members?.length || 0} คน
                        </div>
                        {ownedCarpool.members && ownedCarpool.members.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-blue-200">
                            <p className="text-xs font-medium text-blue-800 mb-1">
                              รายชื่อสมาชิกทะเบียนรถคันนี้:
                            </p>
                            {ownedCarpool.assignedCarNumber && (
                              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2 mb-2">
                                <p className="text-xs text-yellow-800">
                                  ⚠️ รถคันนี้ถูกจัดเลขรถแล้ว ไม่สามารถลบสมาชิกออกได้
                                  <br />
                                  หากต้องการแก้ไข กรุณาติดต่อ Admin
                                </p>
                              </div>
                            )}
                            <div className="space-y-1">
                              {ownedCarpool.members.map((member: any) => {
                                const isMyTeamMember =
                                  member.registrationId === userRegistration?.registrationId;
                                // Check if carpool has assigned car number (block removal if assigned)
                                // assignedCarNumber can be undefined (not assigned) or a number (assigned)
                                const hasAssignedNumber = typeof ownedCarpool.assignedCarNumber === 'number' && ownedCarpool.assignedCarNumber > 0;
                                const canRemove = !hasAssignedNumber;
                                console.log('[Button Logic]', {
                                  carpoolId: ownedCarpool.carpoolId,
                                  assignedCarNumber: ownedCarpool.assignedCarNumber,
                                  typeOf: typeof ownedCarpool.assignedCarNumber,
                                  isNumber: typeof ownedCarpool.assignedCarNumber === 'number',
                                  hasAssignedNumber,
                                  canRemove,
                                });

                                let displayName = member.name;
                                try {
                                  const parsed = JSON.parse(member.name);
                                  displayName = Array.isArray(parsed) ? parsed[0] : parsed;
                                } catch {
                                  displayName = member.name
                                    .replace(/^\["|"\]$/g, '')
                                    .replace(/^['"]|['"]$/g, '');
                                }

                                return (
                                  <div
                                    key={`${member.lineUserId}-${member.name}`}
                                    className="text-xs text-blue-700 flex items-center justify-between gap-2"
                                  >
                                    <span>
                                      • {displayName}
                                      {!isMyTeamMember && member.companyName && (
                                        <span className="italic font-light text-blue-500">
                                          {' '}
                                          ({member.companyName}) - joined
                                        </span>
                                      )}
                                    </span>
                                    {canRemove && (
                                      <button
                                        onClick={() =>
                                          handleRemoveTeamMember(member.lineUserId, member.name)
                                        }
                                        className="text-[10px] px-2 py-0.5 bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors"
                                      >
                                        ย้ายออก
                                      </button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Action buttons */}
                        <div className="mt-3 pt-2 border-t border-blue-200">
                          <button
                            onClick={() => {
                              setInvitingToCarpoolId(ownedCarpool.carpoolId);
                              setShowInviteModal(true);
                              fetchAllCarpools();
                            }}
                            className="w-full text-xs px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                          >
                            👥 ชวนเพื่อนไปด้วยกัน
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Joined Carpools Section */}
            {joinedCarpools.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-green-700 mb-2">Carpools ที่เข้าร่วม</p>
                <div className="space-y-2">
                  {joinedCarpools.map((carpool) => (
                    <div
                      key={carpool.carpoolId}
                      className="px-4 py-3 bg-green-50 border border-green-300 rounded-lg"
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <p className="text-lg font-semibold text-green-900">
                              เลขทะเบียน: {carpool.licensePlate}
                            </p>
                            <p className="text-xs text-green-700">
                              เจ้าของ: {carpool.ownerCompanyName}
                            </p>
                          </div>
                          {carpool.assignedCarNumber &&
                            event.carpoolSettings?.showCarNumbersToMembers && (
                              <div className="text-right">
                                <p className="text-xs text-green-600">เลขรถ</p>
                                <p className="text-lg font-bold text-green-900">
                                  {carpool.assignedCarNumber}
                                </p>
                              </div>
                            )}
                        </div>
                        <div className="text-xs text-green-700">
                          จำนวนสมาชิกร่วมรถคันนี้: {carpool.members?.length || 0} คน
                        </div>
                        {carpool.members && carpool.members.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-green-200">
                            <p className="text-xs font-medium text-green-800 mb-1">
                              รายชื่อสมาชิกทะเบียนรถคันนี้:
                            </p>
                            {carpool.assignedCarNumber && (
                              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2 mb-2">
                                <p className="text-xs text-yellow-800">
                                  ⚠️ รถคันนี้ถูกจัดเลขรถแล้ว ไม่สามารถลบสมาชิกออกได้
                                  <br />
                                  หากต้องการแก้ไข กรุณาติดต่อ Admin
                                </p>
                              </div>
                            )}
                            <div className="space-y-1">
                              {carpool.members.map((member: any) => {
                                const isMyTeamMember =
                                  member.registrationId === userRegistration?.registrationId;
                                // Check if carpool has assigned car number (block leaving if assigned)
                                const hasAssignedNumber = typeof carpool.assignedCarNumber === 'number' && carpool.assignedCarNumber > 0;
                                const canLeave = !hasAssignedNumber;

                                let displayName = member.name;
                                try {
                                  const parsed = JSON.parse(member.name);
                                  displayName = Array.isArray(parsed) ? parsed[0] : parsed;
                                } catch {
                                  displayName = member.name
                                    .replace(/^\["|"\]$/g, '')
                                    .replace(/^['"]|['"]$/g, '');
                                }

                                return (
                                  <div
                                    key={`${member.lineUserId}-${member.name}`}
                                    className="text-xs text-green-700 flex items-center justify-between gap-2"
                                  >
                                    <span>
                                      • {displayName}
                                      {isMyTeamMember && (
                                        <span className="italic font-light text-green-500">
                                          {' '}
                                          - joined
                                        </span>
                                      )}
                                    </span>
                                    {isMyTeamMember && canLeave && (
                                      <button
                                        onClick={() =>
                                          handleRemoveTeamMember(
                                            member.lineUserId,
                                            member.name,
                                            carpool.carpoolId
                                          )
                                        }
                                        className="text-[10px] px-2 py-0.5 bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors"
                                      >
                                        ย้ายออก
                                      </button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-center">
            <p className="text-sm text-gray-500 italic">ยังไม่มี Carpool</p>
          </div>
        )}
      </div>

      {/* TODO: Add modals for Create Carpool, Join Carpool, Invite Members, Delete Confirmation */}
      {/* These modals will be implemented in the next iteration */}
    </div>
  );
}
