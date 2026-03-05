import { NextRequest, NextResponse } from 'next/server';
import { validateReferralCode } from '@/lib/firestore-admin';

export async function POST(req: NextRequest) {
  try {
    const { code } = await req.json();

    if (!code) {
      return NextResponse.json({ error: 'Code required' }, { status: 400 });
    }

    const result = await validateReferralCode(code);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Validate code error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
