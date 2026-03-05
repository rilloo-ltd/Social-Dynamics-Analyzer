import { NextRequest, NextResponse } from 'next/server';
import { checkDailyUploadLimit, incrementDailyUpload } from '@/lib/firestore-admin';

const MAX_DAILY_UPLOADS = 2;

export async function POST(req: NextRequest) {
  try {
    const { userId, action } = await req.json();

    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 });
    }

    if (action === 'check') {
      const result = await checkDailyUploadLimit(userId, MAX_DAILY_UPLOADS);
      return NextResponse.json({ 
        canUpload: result.canUpload, 
        currentCount: result.currentCount, 
        maxUploads: MAX_DAILY_UPLOADS,
        remainingUploads: result.remainingUploads
      });
    } else if (action === 'increment') {
      try {
        const result = await incrementDailyUpload(userId, MAX_DAILY_UPLOADS);
        return NextResponse.json(result);
      } catch (error: any) {
        if (error.message === 'Daily upload limit reached') {
          return NextResponse.json({ 
            error: 'Daily upload limit reached',
            currentCount: MAX_DAILY_UPLOADS,
            maxUploads: MAX_DAILY_UPLOADS
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
