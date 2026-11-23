import React, { useEffect, useState } from 'react';
import { Award, Calendar, CheckSquare, Eye, Lock, Megaphone, Trophy, UserCheck } from 'lucide-react';
import { PlayerProfileModal } from '../components/PlayerProfileModal.tsx';
import { AvatarBadge, EmptyState, PageHeader } from '../components/UI.tsx';
import { api } from '../lib/api.ts';
import { useLang } from '../lib/i18n.tsx';
import { formatDateAr, PLAYER_STATUS_LABELS } from '../lib/labels.ts';
import type {
  AttendanceRecord,
  ClubSettings,
  EvaluationRecord,
  Player,
  PublicUser,
} from '../types/wab.ts';

export const ParentChildrenPage: React.FC<{
  user: PublicUser;
  club: ClubSettings;
  onNavigate: (tab: string) => void;
}> = ({ user, club, onNavigate }) => {
  const { lang, t } = useLang();
  const [players, setPlayers] = useState<Player[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [evaluations, setEvaluations] = useState<EvaluationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.getPlayers(),
      api.getAttendance(),
      api.getEvaluations(),
    ])
      .then(([pls, att, evs]) => {
        setPlayers(pls);
        setAttendance(att);
        setEvaluations(evs);
      })
      .finally(() => setLoading(false));
  }, [user.id]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={lang === 'fr' ? 'Fiche de mon enfant au club' : 'بطاقة ابني في النادي'}
        subtitle={
          lang === 'fr'
            ? 'Consultation en lecture seule : entraîneur, présences, entraînements, matchs et annonces'
            : 'الاطلاع على معلومات اللاعب، اسم المدرب، نسبة الحضور والغياب، وبرامج التدريب والمباريات'
        }
        actions={
          <span className="inline-flex items-center gap-1.5 rounded-xl bg-[#DCFCE7] text-[#14532D] px-3 py-2 text-xs font-extrabold">
            <Lock className="w-3.5 h-3.5" />
            <span>{t.readOnlyBadge}</span>
          </span>
        }
      />

      {loading ? (
        <div className="h-44 rounded-xl bg-gray-200/70" />
      ) : players.length === 0 ? (
        <EmptyState
          title={lang === 'fr' ? 'Aucun enfant associé à ce compte' : 'لا يوجد أبناء مرتبطون بحسابك بعد'}
          description={
            lang === 'fr'
              ? "Veuillez contacter l'administration du club pour associer le profil de votre enfant."
              : 'يرجى مراجعة إدارة نادي وداد أمل بوعنان لربط ملفات أبنائك بحسابك.'
          }
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {players.map((child) => {
            const childAtt = attendance.filter((a) => a.playerId === child.id);
            const presentCount = childAtt.filter((a) => a.status === 'present').length;
            const absentCount = childAtt.filter((a) => a.status === 'absent').length;
            const attRate = childAtt.length > 0 ? Math.round((presentCount / childAtt.length) * 100) : 0;
            const latestEval = evaluations.find((e) => e.playerId === child.id);
            const coachText =
              child.coachNames && child.coachNames.length > 0
                ? child.coachNames.join(' · ')
                : lang === 'fr'
                  ? 'Non assigné'
                  : 'غير معين حالياً';

            return (
              <div key={child.id} className="wab-card rounded-2xl p-5 space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <AvatarBadge name={child.fullName} photoUrl={child.photoUrl} size="lg" />
                    <div className="min-w-0 space-y-1">
                      <h3 className="text-lg font-extrabold text-[#111827] truncate">{child.fullName}</h3>
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-gray-600">
                        <span className="font-mono-num font-extrabold text-[#14532D] bg-[#DCFCE7] px-2 py-0.5 rounded-md">
                          {child.categoryId}
                        </span>
                        <span>·</span>
                        <span>{child.position || (lang === 'fr' ? 'Joueur académie' : 'لاعب أكاديمية')}</span>
                        <span>·</span>
                        <span>{PLAYER_STATUS_LABELS[child.status]}</span>
                      </div>
                      <div className="text-[11px] font-mono-num text-gray-500">
                        {t.birthDateLabel}: {formatDateAr(child.birthDate)}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Coach Name Row */}
                <div className="rounded-xl border border-gray-200 bg-[#F8FAFC] px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs">
                  <span className="inline-flex items-center gap-1.5 font-bold text-gray-600">
                    <UserCheck className="w-4 h-4 text-[#14532D]" />
                    <span>{t.coachLabel}:</span>
                  </span>
                  <span className="font-extrabold text-[#111827] truncate">{coachText}</span>
                </div>

                {/* Attendance & Evaluation KPIs (Zero Subscription / Finance Info) */}
                <div className="grid grid-cols-3 gap-2.5 text-center">
                  <div className="rounded-xl bg-[#DCFCE7]/50 border border-[#14532D]/20 p-3">
                    <div className="text-base font-extrabold font-mono-num text-[#14532D]">{attRate}%</div>
                    <div className="text-[11px] text-gray-600">{t.attendanceRateLabel}</div>
                  </div>
                  <div className="rounded-xl bg-[#F8FAFC] border border-gray-200 p-3">
                    <div className="text-base font-extrabold font-mono-num text-[#111827]">
                      {presentCount} / {absentCount}
                    </div>
                    <div className="text-[11px] text-gray-600">
                      {lang === 'fr' ? 'Prés. / Abs.' : 'حضور / غياب'}
                    </div>
                  </div>
                  <div className="rounded-xl bg-[#F8FAFC] border border-gray-200 p-3">
                    <div className="text-base font-extrabold font-mono-num text-[#14532D]">
                      {latestEval ? `${latestEval.overallAverage}/10` : '—'}
                    </div>
                    <div className="text-[11px] text-gray-600">
                      {lang === 'fr' ? 'Dernière note' : 'آخر تقييم'}
                    </div>
                  </div>
                </div>

                {/* Quick Read-Only Navigation Buttons */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={() => setSelectedPlayerId(child.id)}
                    className="col-span-2 sm:col-span-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#14532D] py-2.5 px-3 text-xs font-bold text-white hover:bg-[#166534] min-h-[44px]"
                  >
                    <Eye className="w-4 h-4" />
                    <span>{lang === 'fr' ? 'Fiche complète' : 'الملف الكامل'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate('attendance')}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-gray-300 bg-white py-2.5 px-3 text-xs font-bold text-[#111827] hover:border-[#14532D] min-h-[44px]"
                  >
                    <CheckSquare className="w-4 h-4 text-[#14532D]" />
                    <span>{t.attendanceLabel}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate('evaluations')}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-gray-300 bg-white py-2.5 px-3 text-xs font-bold text-[#111827] hover:border-[#14532D] min-h-[44px]"
                  >
                    <Award className="w-4 h-4 text-[#14532D]" />
                    <span>{lang === 'fr' ? 'Évaluations' : 'التقييم'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate('trainings')}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-gray-300 bg-white py-2.5 px-3 text-xs font-bold text-[#111827] hover:border-[#14532D] min-h-[44px]"
                  >
                    <Calendar className="w-4 h-4 text-[#14532D]" />
                    <span>{t.trainingsProgramLabel}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate('matches')}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-gray-300 bg-white py-2.5 px-3 text-xs font-bold text-[#111827] hover:border-[#14532D] min-h-[44px]"
                  >
                    <Trophy className="w-4 h-4 text-[#14532D]" />
                    <span>{t.matchesProgramLabel}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate('announcements')}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-gray-300 bg-white py-2.5 px-3 text-xs font-bold text-[#111827] hover:border-[#14532D] min-h-[44px]"
                  >
                    <Megaphone className="w-4 h-4 text-[#14532D]" />
                    <span>{t.resultsAnnouncementsLabel}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <PlayerProfileModal
        playerId={selectedPlayerId}
        role={user.role}
        club={club}
        onClose={() => setSelectedPlayerId(null)}
      />
    </div>
  );
};
