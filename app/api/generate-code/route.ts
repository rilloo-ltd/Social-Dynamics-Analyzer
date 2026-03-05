import { NextRequest, NextResponse } from 'next/server';
import { createGlobalReferralCode } from '@/lib/firestore-admin';
import { randomBytes } from 'crypto';

export async function POST(req: NextRequest) {
  try {
    const { userId, userName } = await req.json();

    if (!userId || !userName) {
      return NextResponse.json({ error: 'User ID and name required' }, { status: 400 });
    }

    // Generate 8-character alphanumeric code
    const code = randomBytes(4).toString('hex').toUpperCase();

    await createGlobalReferralCode(userId, userName, code, 3);

    return NextResponse.json({ success: true, code });
  } catch (error) {
    console.error('Generate code error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
