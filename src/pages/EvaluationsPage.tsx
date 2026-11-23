import React, { useEffect, useState } from 'react';
import { Award, CheckCircle2, EyeOff, Plus } from 'lucide-react';
import { EvaluationRadarChart } from '../components/Charts.tsx';
import { EmptyState, Modal, PageHeader } from '../components/UI.tsx';
import { api } from '../lib/api.ts';
import { EVALUATION_CRITERIA, formatDateAr } from '../lib/labels.ts';
import type { EvaluationRecord, EvaluationScores, Player, PublicUser } from '../types/wab.ts';

const DEFAULT_SCORES: EvaluationScores = {
  technical: 7,
  passing: 7,
  ballControl: 7,
  shooting: 7,
  tactical: 7,
  fitness: 7,
  discipline: 8,
  teamwork: 8,
  development: 8,
};

export const EvaluationsPage: React.FC<{ user: PublicUser }> = ({ user }) => {
  const canEdit = user.role === 'admin' || user.role === 'coach';
  const [evaluations, setEvaluations] = useState<EvaluationRecord[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  const [playerId, setPlayerId] = useState('');
  const [period, setPeriod] = useState('التقييم الشهري الدوري');
  const [scores, setScores] = useState<EvaluationScores>({ ...DEFAULT_SCORES });
  const [notes, setNotes] = useState('');
  const [published, setPublished] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [evs, pls] = await Promise.all([api.getEvaluations(), api.getPlayers()]);
      setEvaluations(evs);
      const activePls = pls.filter((p) => p.status === 'active');
      setPlayers(activePls);
      if (!playerId && activePls.length > 0) setPlayerId(activePls[0].id);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [user.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerId) return;
    setSaving(true);
    try {
      await api.createEvaluation({ playerId, period, scores, notes, published });
      setModalOpen(false);
      setScores({ ...DEFAULT_SCORES });
      setNotes('');
      await load();
    } finally {
      setSaving(false);
    }
  };

  const togglePublish = async (ev: EvaluationRecord) => {
    await api.updateEvaluation(ev.id, { published: !ev.published });
    await load();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="التقييم الفني للاعبين"
        subtitle={
          canEdit
            ? 'تقييم المهارات الفنية، التكتيكية، البدنية، والانضباط مع رسم بياني تفصيلي'
            : 'الاطلاع على التقييمات الفنية المعتمدة والمنشورة لأبنائك'
        }
        actions={
          canEdit && (
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-[#14532D] px-4 py-2 text-xs font-bold text-white hover:bg-[#166534] min-h-[44px]"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة تقييم فني</span>
            </button>
          )
        }
      />

      {loading ? (
        <div className="h-48 rounded-2xl bg-slate-200/70" />
      ) : evaluations.length === 0 ? (
        <EmptyState
          title="لا توجد تقييمات فنية مسجلة."
          description={
            canEdit
              ? players.length > 0
                ? 'ابدأ بإضافة أول تقييم فني للاعبين.'
                : 'أضف أول لاعب نشط في النادي لتتمكن من تقييمه فنياً.'
              : 'سيظهر التقييم هنا فور نشره واعتماده من قبل الإدارة أو المدرب.'
          }
          action={
            canEdit && players.length > 0 ? (
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-[#14532D] px-4 py-2 text-xs font-bold text-white hover:bg-[#166534] min-h-[44px]"
              >
                <Plus className="w-4 h-4" />
                <span>إضافة أول تقييم فني</span>
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          {evaluations.map((ev) => (
            <div key={ev.id} className="wab-card rounded-2xl p-5 space-y-4">
              <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-200">
                <div>
                  <h3 className="text-base font-extrabold text-[#111827]">{ev.playerName}</h3>
                  <div className="text-xs text-slate-500 mt-0.5">
                    <span className="font-mono-num font-extrabold text-[#14532D]">{ev.categoryId}</span> · {ev.period} ·{' '}
                    {formatDateAr(ev.date)}
                  </div>
                </div>
                <div className="text-left">
                  <div className="text-xl font-extrabold font-mono-num text-[#14532D]">{ev.overallAverage} / 10</div>
                  <div className="text-[11px] text-slate-500 font-semibold">المعدل العام</div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                <EvaluationRadarChart scores={ev.scores} />
                <div className="space-y-2 text-xs">
                  {EVALUATION_CRITERIA.map((c) => (
                    <div key={c.key} className="flex items-center justify-between gap-2">
                      <span className="text-slate-600">{c.label}</span>
                      <span className="font-mono-num font-extrabold text-[#111827]">{ev.scores[c.key]} / 10</span>
                    </div>
                  ))}
                </div>
              </div>

              {ev.notes && (
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-xs text-slate-700 leading-relaxed">
                  <span className="font-bold text-[#111827]">ملاحظات المدرب ({ev.coachName}): </span>
                  {ev.notes}
                </div>
              )}

              {canEdit && (
                <div className="flex items-center justify-between pt-2 border-t border-slate-200 text-xs">
                  <span className={ev.published ? 'text-emerald-700 font-bold' : 'text-amber-700 font-bold'}>
                    {ev.published ? 'منشور ومفتوح للولي' : 'مسودة (غير ظاهر للولي)'}
                  </span>
                  <button
                    type="button"
                    onClick={() => togglePublish(ev)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 font-bold text-[#111827] hover:border-[#14532D] min-h-[40px]"
                  >
                    {ev.published ? <EyeOff className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />}
                    <span>{ev.published ? 'إخفاء عن الولي' : 'نشر للولي'}</span>
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal open={modalOpen} title="إضافة تقييم فني جديد" onClose={() => setModalOpen(false)}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">اللاعب *</label>
              <select
                value={playerId}
                onChange={(e) => setPlayerId(e.target.value)}
                required
                className="wab-input"
              >
                {players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.fullName} ({p.categoryId})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">فترة التقييم *</label>
              <input
                type="text"
                required
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className="wab-input"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {EVALUATION_CRITERIA.map((c) => (
              <div key={c.key} className="rounded-xl bg-slate-50 border border-slate-200 p-3">
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-[#111827] font-bold">{c.label}</span>
                  <span className="font-mono-num font-extrabold text-[#14532D]">{scores[c.key]}/10</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={10}
                  value={scores[c.key]}
                  onChange={(e) =>
                    setScores((prev) => ({ ...prev, [c.key]: Number(e.target.value) }))
                  }
                  className="w-full accent-[#14532D]"
                />
              </div>
            ))}
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">الملاحظات الفنية والتوجيهات</label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="نقاط القوة ومجالات التطوير المطلوبة..."
              className="wab-input"
            />
          </div>

          <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={published}
              onChange={(e) => setPublished(e.target.checked)}
              className="accent-[#14532D] w-4 h-4"
            />
            <span>نشر التقييم مباشرة في فضاء ولي الأمر</span>
          </label>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-sm font-bold text-[#111827] min-h-[44px]"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-[#14532D] text-sm font-bold text-white hover:bg-[#166534] min-h-[44px]"
            >
              <Award className="w-4 h-4" />
              <span>{saving ? 'جاري الحفظ...' : 'اعتماد التقييم'}</span>
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
