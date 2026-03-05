import { NextRequest, NextResponse } from 'next/server';
import { useReferralCode } from '@/lib/firestore-admin';

export async function POST(req: NextRequest) {
  try {
    const { code, userId } = await req.json();

    if (!code || !userId) {
      return NextResponse.json({ error: 'Code and user ID required' }, { status: 400 });
    }

    const result = await useReferralCode(code, userId);

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Use code error:', error);
    return NextResponse.json({ error: error.message || 'Server error' }, { status: 500 });
  }
}
