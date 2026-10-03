// API Route for Admin Favorites - Manage favorite members for quick registration
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { adminDb } from '@/lib/firebase-admin';
import { hasPermission } from '@/lib/permissions';

// GET - Get admin's favorite members
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check permission - need events:manage-assigned or higher
    if (!hasPermission(session.user.permissions || [], 'events:manage-assigned')) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const db = adminDb();
    const adminId = session.user.id;

    // Get favorites for this admin
    const favoritesDoc = await db.collection('adminFavorites').doc(adminId).get();

    if (!favoritesDoc.exists) {
      return NextResponse.json({ favorites: [] });
    }

    const data = favoritesDoc.data();
    const favorites = data?.favorites || [];

    return NextResponse.json({ favorites });
  } catch (error) {
    console.error('Error fetching favorites:', error);
    return NextResponse.json({ error: 'Failed to fetch favorites' }, { status: 500 });
  }
}

// POST - Add member to favorites
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check permission
    if (!hasPermission(session.user.permissions || [], 'events:manage-assigned')) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const body = await request.json();
    const { userId, memberId, displayName, companyName, licenseNumber, fullNameTH } = body;

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    const db = adminDb();
    const adminId = session.user.id;
    const favoritesRef = db.collection('adminFavorites').doc(adminId);

    // Get current favorites
    const doc = await favoritesRef.get();
    const currentFavorites = doc.exists ? (doc.data()?.favorites || []) : [];

    // Check if already in favorites
    const exists = currentFavorites.some((f: any) => f.userId === userId);
    if (exists) {
      return NextResponse.json({ error: 'Already in favorites' }, { status: 400 });
    }

    // Add to favorites
    const newFavorite = {
      userId,
      memberId: memberId || null,
      displayName,
      companyName: companyName || null,
      licenseNumber: licenseNumber || null,
      fullNameTH: fullNameTH || null,
      addedAt: new Date(),
    };

    const updatedFavorites = [...currentFavorites, newFavorite];

    await favoritesRef.set({
      favorites: updatedFavorites,
      updatedAt: new Date(),
    }, { merge: true });

    return NextResponse.json({
      success: true,
      message: 'Added to favorites',
      favorites: updatedFavorites,
    });
  } catch (error) {
    console.error('Error adding favorite:', error);
    return NextResponse.json({ error: 'Failed to add favorite' }, { status: 500 });
  }
}

// DELETE - Remove member from favorites
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check permission
    if (!hasPermission(session.user.permissions || [], 'events:manage-assigned')) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    const db = adminDb();
    const adminId = session.user.id;
    const favoritesRef = db.collection('adminFavorites').doc(adminId);

    // Get current favorites
    const doc = await favoritesRef.get();
    if (!doc.exists) {
      return NextResponse.json({ favorites: [] });
    }

    const currentFavorites = doc.data()?.favorites || [];

    // Remove from favorites
    const updatedFavorites = currentFavorites.filter((f: any) => f.userId !== userId);

    await favoritesRef.set({
      favorites: updatedFavorites,
      updatedAt: new Date(),
    }, { merge: true });

    return NextResponse.json({
      success: true,
      message: 'Removed from favorites',
      favorites: updatedFavorites,
    });
  } catch (error) {
    console.error('Error removing favorite:', error);
    return NextResponse.json({ error: 'Failed to remove favorite' }, { status: 500 });
  }
}
