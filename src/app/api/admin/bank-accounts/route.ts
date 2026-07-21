// API Route for Admin - Bank Accounts Management (CRUD)
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { adminDb } from '@/lib/firebase-admin';
import { hasPermission } from '@/lib/permissions';
import { BankAccount, BankAccountInput } from '@/types/bank-account';

// GET - List all bank accounts
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Require admin:access permission
    if (!hasPermission(session.user.permissions || [], 'admin:access')) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const db = adminDb();
    const accountsSnapshot = await db
      .collection('bankAccounts')
      .orderBy('isDefault', 'desc')
      .orderBy('createdAt', 'desc')
      .get();

    const accounts: BankAccount[] = accountsSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        bankName: data.bankName || '',
        accountName: data.accountName || '',
        accountNumber: data.accountNumber || '',
        qrCodeUrl: data.qrCodeUrl || undefined,
        isActive: data.isActive ?? true,
        isDefault: data.isDefault ?? false,
        createdAt: data.createdAt || new Date().toISOString(),
        updatedAt: data.updatedAt || new Date().toISOString(),
        createdBy: data.createdBy,
        updatedBy: data.updatedBy,
      };
    });

    return NextResponse.json({ accounts });
  } catch (error) {
    console.error('Error fetching bank accounts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch bank accounts' },
      { status: 500 }
    );
  }
}

// POST - Create new bank account
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Require admin:access permission
    if (!hasPermission(session.user.permissions || [], 'admin:access')) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const body: BankAccountInput = await request.json();

    // Validation
    if (!body.bankName || !body.accountName || !body.accountNumber) {
      return NextResponse.json(
        { error: 'Missing required fields: bankName, accountName, accountNumber' },
        { status: 400 }
      );
    }

    const db = adminDb();

    // If this account is set as default, unset other defaults
    if (body.isDefault) {
      const defaultAccountsSnapshot = await db
        .collection('bankAccounts')
        .where('isDefault', '==', true)
        .get();

      const batch = db.batch();
      defaultAccountsSnapshot.docs.forEach(doc => {
        batch.update(doc.ref, { isDefault: false });
      });
      await batch.commit();
    }

    // Create new account
    const accountRef = db.collection('bankAccounts').doc();
    const newAccount: Omit<BankAccount, 'id'> = {
      bankName: body.bankName.trim(),
      accountName: body.accountName.trim(),
      accountNumber: body.accountNumber.trim(),
      qrCodeUrl: body.qrCodeUrl?.trim() || undefined,
      isActive: body.isActive ?? true,
      isDefault: body.isDefault ?? false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: session.user.id,
    };

    await accountRef.set(newAccount);

    return NextResponse.json({
      success: true,
      account: { id: accountRef.id, ...newAccount },
    });
  } catch (error) {
    console.error('Error creating bank account:', error);
    return NextResponse.json(
      { error: 'Failed to create bank account' },
      { status: 500 }
    );
  }
}

// PUT - Update bank account
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Require admin:access permission
    if (!hasPermission(session.user.permissions || [], 'admin:access')) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const body = await request.json();
    const { id, ...updates }: { id: string } & Partial<BankAccountInput> = body;

    if (!id) {
      return NextResponse.json({ error: 'Missing account id' }, { status: 400 });
    }

    const db = adminDb();
    const accountRef = db.collection('bankAccounts').doc(id);
    const accountDoc = await accountRef.get();

    if (!accountDoc.exists) {
      return NextResponse.json({ error: 'Bank account not found' }, { status: 404 });
    }

    // If this account is being set as default, unset other defaults
    if (updates.isDefault === true) {
      const defaultAccountsSnapshot = await db
        .collection('bankAccounts')
        .where('isDefault', '==', true)
        .get();

      const batch = db.batch();
      defaultAccountsSnapshot.docs.forEach(doc => {
        if (doc.id !== id) {
          batch.update(doc.ref, { isDefault: false });
        }
      });
      await batch.commit();
    }

    // Update account
    const updateData: any = {
      ...updates,
      updatedAt: new Date().toISOString(),
      updatedBy: session.user.id,
    };

    // Clean up undefined values
    Object.keys(updateData).forEach(key => {
      if (updateData[key] === undefined) {
        delete updateData[key];
      }
    });

    await accountRef.update(updateData);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating bank account:', error);
    return NextResponse.json(
      { error: 'Failed to update bank account' },
      { status: 500 }
    );
  }
}

// DELETE - Delete bank account
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Require admin:access permission
    if (!hasPermission(session.user.permissions || [], 'admin:access')) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Missing account id' }, { status: 400 });
    }

    const db = adminDb();
    const accountRef = db.collection('bankAccounts').doc(id);
    const accountDoc = await accountRef.get();

    if (!accountDoc.exists) {
      return NextResponse.json({ error: 'Bank account not found' }, { status: 404 });
    }

    // Check if this is the default account
    const accountData = accountDoc.data();
    if (accountData?.isDefault) {
      return NextResponse.json(
        { error: 'Cannot delete default bank account. Please set another account as default first.' },
        { status: 400 }
      );
    }

    await accountRef.delete();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting bank account:', error);
    return NextResponse.json(
      { error: 'Failed to delete bank account' },
      { status: 500 }
    );
  }
}
