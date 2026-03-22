'use client';

import React from 'react';

export type ParticipantAxisVisualKey = 'liberalism' | 'calmness' | 'rationalism' | 'humor';

export interface ParticipantAxisVisualMetric {
  axisKey: ParticipantAxisVisualKey;
  label: string;
  score: number;
  comparison: string;
}

export interface ParticipantAxisVisualParticipant {
  participantName: string;
  metrics: ParticipantAxisVisualMetric[];
}

interface ParticipantAxisVisualizerProps {
  participants: ParticipantAxisVisualParticipant[];
}

interface ParticipantAxisSharePosterProps {
  participants: ParticipantAxisVisualParticipant[];
}

interface ParticipantAxisChampion {
  axisKey: ParticipantAxisVisualKey;
  participantNames: string[];
  score: number;
}

const AXIS_ORDER: ParticipantAxisVisualKey[] = ['liberalism', 'calmness', 'rationalism', 'humor'];

const AXIS_THEME: Record<
  ParticipantAxisVisualKey,
  {
    label: string;
    chipClassName: string;
    textClassName: string;
    barClassName: string;
    strokeColor: string;
    fillColor: string;
    glowColor: string;
  }
> = {
  liberalism: {
    label: 'ליברליזם',
    chipClassName: 'border-cyan-200 bg-cyan-50 text-cyan-700',
    textClassName: 'text-cyan-700',
    barClassName: 'from-cyan-400 to-sky-500',
    strokeColor: '#06b6d4',
    fillColor: 'rgba(34, 211, 238, 0.20)',
    glowColor: 'rgba(34, 211, 238, 0.35)',
  },
  calmness: {
    label: 'רוגע',
    chipClassName: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    textClassName: 'text-emerald-700',
    barClassName: 'from-emerald-400 to-teal-500',
    strokeColor: '#10b981',
    fillColor: 'rgba(16, 185, 129, 0.20)',
    glowColor: 'rgba(16, 185, 129, 0.30)',
  },
  rationalism: {
    label: 'רציונליות',
    chipClassName: 'border-violet-200 bg-violet-50 text-violet-700',
    textClassName: 'text-violet-700',
    barClassName: 'from-violet-400 to-fuchsia-500',
    strokeColor: '#8b5cf6',
    fillColor: 'rgba(139, 92, 246, 0.18)',
    glowColor: 'rgba(139, 92, 246, 0.30)',
  },
  humor: {
    label: 'הומור',
    chipClassName: 'border-amber-200 bg-amber-50 text-amber-700',
    textClassName: 'text-amber-700',
    barClassName: 'from-amber-400 to-orange-500',
    strokeColor: '#f59e0b',
    fillColor: 'rgba(245, 158, 11, 0.20)',
    glowColor: 'rgba(245, 158, 11, 0.30)',
  },
};

const getAxisChampions = (participants: ParticipantAxisVisualParticipant[]): ParticipantAxisChampion[] => {
  return AXIS_ORDER.map((axisKey) => {
    let bestScore = -1;
    let participantNames: string[] = [];

    for (const participant of participants) {
      const metric = participant.metrics.find((item) => item.axisKey === axisKey);
      if (!metric) continue;

      if (metric.score > bestScore) {
        bestScore = metric.score;
        participantNames = [participant.participantName];
      } else if (metric.score === bestScore) {
        participantNames.push(participant.participantName);
      }
    }

    return {
      axisKey,
      participantNames,
      score: Math.max(bestScore, 0),
    };
  }).filter((champion) => champion.score > 0 && champion.participantNames.length > 0);
};

const getSharePosterColumns = (participantCount: number): number => {
  if (participantCount <= 4) return 2;
  if (participantCount <= 9) return 3;
  return 4;
};

const getSharePosterWidth = (columnCount: number): number => {
  if (columnCount === 2) return 1180;
  if (columnCount === 3) return 1460;
  return 1720;
};

const ParticipantMetricRow = ({ metric }: { metric: ParticipantAxisVisualMetric }) => {
  const axisTheme = AXIS_THEME[metric.axisKey];

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-3 shadow-sm shadow-slate-200/70">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className={`text-sm font-black ${axisTheme.textClassName}`}>{metric.label}</div>
        <div className={`rounded-full border px-2.5 py-1 text-xs font-bold ${axisTheme.chipClassName}`}>
          {metric.score}/10
        </div>
      </div>

      <div className="relative mb-2 h-2.5 overflow-hidden rounded-full bg-slate-200">
        <div className="absolute inset-0 grid grid-cols-10 gap-px opacity-30">
          {Array.from({ length: 10 }).map((_, index) => (
            <span key={index} className="bg-white/60" />
          ))}
        </div>
        <div
          className={`absolute inset-y-0 right-0 rounded-full bg-gradient-to-l ${axisTheme.barClassName}`}
          style={{
            width: `${metric.score * 10}%`,
            boxShadow: `0 0 18px -6px ${axisTheme.glowColor}`,
          }}
        />
      </div>

      <p className="text-xs leading-5 text-slate-600">{metric.comparison}</p>
    </div>
  );
};

const ParticipantAxisCard = ({
  participant,
  index,
}: {
  participant: ParticipantAxisVisualParticipant;
  index: number;
}) => {
  return (
    <article className="relative overflow-hidden rounded-[1.75rem] border border-slate-200/80 bg-white/90 p-4 shadow-[0_20px_55px_-35px_rgba(15,23,42,0.35)] backdrop-blur-sm">
      <div className="absolute inset-x-4 top-0 h-1 rounded-b-full bg-gradient-to-r from-cyan-400 via-violet-400 to-amber-400" />
      <div
        className="absolute -right-8 -top-10 h-24 w-24 rounded-full blur-3xl"
        style={{ background: index % 2 === 0 ? 'rgba(34, 211, 238, 0.10)' : 'rgba(139, 92, 246, 0.10)' }}
      />

      <div className="relative z-10">
        <div className="mb-4 min-w-0 text-right">
          <div className="mb-1 text-[11px] font-bold tracking-[0.18em] text-slate-400">משתתף</div>
          <h4 className="text-lg font-black leading-6 text-slate-900 break-words">{participant.participantName}</h4>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {AXIS_ORDER.map((axisKey) => {
            const metric = participant.metrics.find((item) => item.axisKey === axisKey);
            if (!metric) return null;

            return <ParticipantMetricRow key={axisKey} metric={metric} />;
          })}
        </div>
      </div>
    </article>
  );
};

const AxisChampionCard = ({ champion }: { champion: ParticipantAxisChampion }) => {
  const axisTheme = AXIS_THEME[champion.axisKey];
  const winnerLabel = champion.participantNames.join(' · ');
  const isTie = champion.participantNames.length > 1;

  return (
    <article className="relative overflow-hidden rounded-[1.5rem] border border-slate-200/80 bg-white/95 p-4 shadow-[0_18px_45px_-34px_rgba(15,23,42,0.28)]">
      <div
        className={`absolute inset-x-4 top-0 h-1 rounded-b-full bg-gradient-to-r ${axisTheme.barClassName}`}
      />
      <div className="relative z-10 text-right">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className={`rounded-full border px-2.5 py-1 text-xs font-bold ${axisTheme.chipClassName}`}>
            {champion.score}/10
          </div>
          <div className={`text-base font-black ${axisTheme.textClassName}`}>אלוף ה{axisTheme.label}</div>
        </div>

        <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-3">
          <div className="mb-1 text-[11px] font-bold tracking-[0.16em] text-slate-400">
            {isTie ? 'שוויון במקום הראשון' : 'במקום הראשון'}
          </div>
          <div className="text-lg font-black leading-6 text-slate-900 break-words">{winnerLabel}</div>
        </div>
      </div>
    </article>
  );
};

const SharePosterMetricTile = ({ metric }: { metric: ParticipantAxisVisualMetric }) => {
  const axisTheme = AXIS_THEME[metric.axisKey];

  return (
    <div className="rounded-[1.35rem] border border-slate-200/80 bg-white/92 p-4 shadow-[0_16px_34px_-26px_rgba(15,23,42,0.28)]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className={`text-xl font-black ${axisTheme.textClassName}`}>{metric.label}</div>
        <div className={`rounded-full border px-3 py-1.5 text-2xl font-black ${axisTheme.chipClassName}`}>
          {metric.score}/10
        </div>
      </div>

      <div className="grid grid-cols-10 gap-1.5">
        {Array.from({ length: 10 }).map((_, index) => {
          const filled = index < metric.score;
          return (
            <span
              key={index}
              className={`h-3.5 rounded-full ${filled ? `bg-gradient-to-l ${axisTheme.barClassName}` : 'bg-slate-200'}`}
              style={filled ? { boxShadow: `0 0 14px -7px ${axisTheme.glowColor}` } : undefined}
            />
          );
        })}
      </div>
    </div>
  );
};

const SharePosterParticipantCard = ({
  participant,
  index,
}: {
  participant: ParticipantAxisVisualParticipant;
  index: number;
}) => {
  return (
    <article className="relative overflow-hidden rounded-[2rem] border border-slate-200/80 bg-white/92 p-5 shadow-[0_28px_60px_-42px_rgba(15,23,42,0.28)]">
      <div className="absolute inset-x-6 top-0 h-1.5 rounded-b-full bg-gradient-to-r from-cyan-400 via-violet-400 to-amber-400" />
      <div
        className="absolute -top-10 h-24 w-24 rounded-full blur-3xl"
        style={{
          left: index % 2 === 0 ? '-1.25rem' : 'auto',
          right: index % 2 === 0 ? 'auto' : '-1.25rem',
          background: index % 2 === 0 ? 'rgba(56, 189, 248, 0.16)' : 'rgba(168, 85, 247, 0.14)',
        }}
      />

      <div className="relative z-10">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold tracking-[0.18em] text-slate-500">
            משתתף
          </div>
          <h4 className="min-w-0 text-right text-[2rem] font-black leading-9 text-slate-900 break-words">
            {participant.participantName}
          </h4>
        </div>

        <div className="grid gap-3">
          {AXIS_ORDER.map((axisKey) => {
            const metric = participant.metrics.find((item) => item.axisKey === axisKey);
            if (!metric) return null;

            return <SharePosterMetricTile key={axisKey} metric={metric} />;
          })}
        </div>
      </div>
    </article>
  );
};

const SharePosterChampionCard = ({ champion }: { champion: ParticipantAxisChampion }) => {
  const axisTheme = AXIS_THEME[champion.axisKey];
  const winnerLabel = champion.participantNames.join(' · ');
  const isTie = champion.participantNames.length > 1;

  return (
    <article className="relative overflow-hidden rounded-[1.65rem] border border-slate-200/80 bg-white/95 p-4 shadow-[0_20px_40px_-30px_rgba(15,23,42,0.26)]">
      <div className={`absolute inset-x-5 top-0 h-1.5 rounded-b-full bg-gradient-to-r ${axisTheme.barClassName}`} />
      <div className="relative z-10 text-right">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className={`text-lg font-black ${axisTheme.textClassName}`}>אלוף ה{axisTheme.label}</div>
          <div className={`rounded-full border px-3 py-1.5 text-sm font-black ${axisTheme.chipClassName}`}>
            {champion.score}/10
          </div>
        </div>

        <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-3.5">
          <div className="mb-1 text-[11px] font-bold tracking-[0.18em] text-slate-400">
            {isTie ? 'שוויון במקום הראשון' : 'במקום הראשון'}
          </div>
          <div className="text-xl font-black leading-7 text-slate-900 break-words">{winnerLabel}</div>
        </div>
      </div>
    </article>
  );
};

export const ParticipantAxisVisualizer: React.FC<ParticipantAxisVisualizerProps> = ({ participants }) => {
  if (!participants.length) {
    return null;
  }

  const axisChampions = getAxisChampions(participants);

  return (
    <section className="mt-10 overflow-hidden rounded-[2rem] border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-sky-50 p-5 shadow-[0_24px_70px_-40px_rgba(15,23,42,0.28)] sm:p-6">
      <div className="mb-6 flex flex-col gap-3 text-right sm:flex-row sm:items-end sm:justify-between">
        <div className="inline-flex w-fit items-center gap-2 self-end rounded-full border border-sky-200 bg-white/90 px-3 py-1.5 text-xs font-bold text-sky-700 shadow-sm">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-sky-400 shadow-[0_0_14px_rgba(56,189,248,0.8)]" />
          פרופיל חזותי
        </div>
        <div>
          <h3 className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">מפת הצירים של המשתתפים</h3>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
            לכל משתתף מוצג מבט מהיר על הציונים, יחד עם הטקסט המסביר איך הוא ממוקם ביחס לשאר הנבדקים.
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {participants.map((participant, index) => (
          <ParticipantAxisCard key={`${participant.participantName}-${index}`} participant={participant} index={index} />
        ))}
      </div>

      {axisChampions.length > 0 && (
        <div className="mt-8 border-t border-slate-200/80 pt-6">
          <div className="mb-4 text-right">
            <h4 className="text-xl font-black text-slate-900">אלופי הקבוצה לפי ציר</h4>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              מי קיבל את הציון הגבוה ביותר בכל אחד מארבעת הצירים.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {axisChampions.map((champion) => (
              <AxisChampionCard key={champion.axisKey} champion={champion} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
};

export const ParticipantAxisSharePoster: React.FC<ParticipantAxisSharePosterProps> = ({ participants }) => {
  if (!participants.length) {
    return null;
  }

  const axisChampions = getAxisChampions(participants);
  const columnCount = getSharePosterColumns(participants.length);
  const posterWidth = getSharePosterWidth(columnCount);

  return (
    <section
      dir="rtl"
      className="overflow-hidden rounded-[2.5rem] border border-slate-200 bg-[radial-gradient(circle_at_top,_rgba(125,211,252,0.22),_transparent_32%),linear-gradient(135deg,_#ffffff_0%,_#f8fafc_48%,_#eef6ff_100%)] p-10 shadow-[0_40px_90px_-52px_rgba(15,23,42,0.30)]"
      style={{ width: `${posterWidth}px` }}
    >
      <div className="mb-8 flex items-start justify-between gap-6">
        <div className="inline-flex shrink-0 items-center gap-2 rounded-full border border-sky-200 bg-white/92 px-4 py-2 text-sm font-bold text-sky-700 shadow-sm">
          <span className="inline-block h-3 w-3 rounded-full bg-sky-400 shadow-[0_0_16px_rgba(56,189,248,0.9)]" />
          פרופיל חזותי
        </div>

        <div className="max-w-4xl text-right">
          <h3 className="text-[2.8rem] font-black leading-[1.05] tracking-tight text-slate-950">
            מפת הצירים של המשתתפים
          </h3>
          <p className="mt-3 text-lg leading-8 text-slate-600">
            כל המשתתפים וכל הציונים בתמונה אחת קומפקטית, כדי שאפשר יהיה לשתף בקלות ולקרוא גם מהטלפון.
          </p>
        </div>
      </div>

      <div
        className="grid gap-5"
        style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }}
      >
        {participants.map((participant, index) => (
          <SharePosterParticipantCard
            key={`${participant.participantName}-${index}`}
            participant={participant}
            index={index}
          />
        ))}
      </div>

      {axisChampions.length > 0 && (
        <div className="mt-8 border-t border-slate-200/80 pt-6">
          <div className="mb-4 text-right">
            <h4 className="text-[1.8rem] font-black text-slate-900">אלופי הקבוצה לפי ציר</h4>
            <p className="mt-1 text-base leading-7 text-slate-600">
              מבט מהיר על המשתתפים שקיבלו את הציון הגבוה ביותר בכל אחד מארבעת הצירים.
            </p>
          </div>

          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
            {axisChampions.map((champion) => (
              <SharePosterChampionCard key={champion.axisKey} champion={champion} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
};
