import { NextRequest, NextResponse } from 'next/server';
import { checkDailyUploadLimit, incrementDailyUpload, getUserTier } from '@/lib/firestore-admin';

export async function POST(req: NextRequest) {
  try {
    const { userId, action } = await req.json();

    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 });
    }

    // Get user's tier and max uploads from database
    const { maxDailyUploads } = await getUserTier(userId);

    if (action === 'check') {
      const result = await checkDailyUploadLimit(userId, maxDailyUploads);
      return NextResponse.json({ 
        canUpload: result.canUpload, 
        currentCount: result.currentCount, 
        maxUploads: maxDailyUploads,
        remainingUploads: result.remainingUploads
      });
    } else if (action === 'increment') {
      try {
        const result = await incrementDailyUpload(userId, maxDailyUploads);
        return NextResponse.json(result);
      } catch (error: any) {
        if (error.message === 'Daily upload limit reached') {
          return NextResponse.json({ 
            error: 'Daily upload limit reached',
            currentCount: maxDailyUploads,
            maxUploads: maxDailyUploads
          }, { status: 429 });
        }
        throw error;
      }
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Track upload error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
