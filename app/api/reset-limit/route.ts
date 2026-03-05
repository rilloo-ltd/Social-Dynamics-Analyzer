import { NextRequest, NextResponse } from 'next/server';
import { resetDailyUploadLimit } from '@/lib/firestore-admin';

// Temporary endpoint to simulate payment and reset daily limit
// TODO: Replace with actual payment processing
export async function POST(req: NextRequest) {
  try {
    const { userId, tier } = await req.json();

    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 });
    }

    // Reset the daily upload limit
    await resetDailyUploadLimit(userId);

    console.log(`[Reset Limit] Reset daily upload limit for user ${userId} with tier: ${tier || 'none'}`);

    return NextResponse.json({ 
      success: true,
      message: 'Daily limit reset successfully',
      tier: tier || 'none'
    });
  } catch (error) {
    console.error('Reset limit error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
