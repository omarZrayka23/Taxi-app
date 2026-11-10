import { useMemo, useState } from 'react';
import { I18nManager, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatDate, parseYmd, toYmd } from '@/lib/format';
import { Button, IconButton, Row, Txt } from '@/components/ui';
import { colors, radius, spacing } from '@/theme';

export interface DateRange {
  start: string | null; // YYYY-MM-DD
  end: string | null; // YYYY-MM-DD, return date (exclusive)
}

type Blocked = { startDate: string; endDate: string }[];

function isBlocked(day: string, blocked: Blocked) {
  return blocked.some((b) => day >= b.startDate && day < b.endDate);
}

function rangeHitsBlocked(start: string, end: string, blocked: Blocked) {
  // rental days are [start, end)
  return blocked.some((b) => start < b.endDate && b.startDate < end);
}

/** Lightweight month calendar for choosing a pickup date and a return date. */
export function RangeCalendar({
  value,
  onChange,
  blocked = [],
}: {
  value: DateRange;
  onChange: (r: DateRange) => void;
  blocked?: Blocked;
}) {
  const { t } = useTranslation();
  const today = toYmd(new Date());
  const initial = value.start ? parseYmd(value.start) : new Date();
  const [month, setMonth] = useState(new Date(initial.getFullYear(), initial.getMonth(), 1));

  const weeks = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7; // Monday first
    const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const cells: (string | null)[] = Array(offset).fill(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(toYmd(new Date(month.getFullYear(), month.getMonth(), d)));
    while (cells.length % 7) cells.push(null);
    const rows: (string | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  }, [month]);

  const pick = (day: string) => {
    const { start, end } = value;
    if (!start || end || day <= start) {
      if (isBlocked(day, blocked)) return;
      onChange({ start: day, end: null });
      return;
    }
    if (rangeHitsBlocked(start, day, blocked)) {
      if (!isBlocked(day, blocked)) onChange({ start: day, end: null });
      return;
    }
    onChange({ start, end: day });
  };

  const weekdays = t('calendar.weekdays', { returnObjects: true }) as unknown as string[];
  const months = t('calendar.months', { returnObjects: true }) as unknown as string[];
  const canGoBack = month > new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  return (
    <View>
      <Row style={{ justifyContent: 'space-between', marginBottom: spacing.sm }}>
        <IconButton
          icon={I18nManager.isRTL ? 'chevron-forward' : 'chevron-back'}
          onPress={() => canGoBack && setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
          color={canGoBack ? colors.text : colors.border}
        />
        <Txt variant="subtitle">
          {months?.[month.getMonth()] ?? month.getMonth() + 1} {month.getFullYear()}
        </Txt>
        <IconButton
          icon={I18nManager.isRTL ? 'chevron-back' : 'chevron-forward'}
          onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
        />
      </Row>
      <Row gap={0}>
        {(Array.isArray(weekdays) ? weekdays : []).map((w) => (
          <Txt key={w} variant="small" style={styles.weekday}>
            {w}
          </Txt>
        ))}
      </Row>
      {weeks.map((row, i) => (
        <Row key={i} gap={0}>
          {row.map((day, j) => {
            if (!day) return <View key={j} style={styles.cell} />;
            const past = day < today;
            const blockedDay = isBlocked(day, blocked);
            const isStart = day === value.start;
            const isEnd = day === value.end;
            const inRange = !!value.start && !!value.end && day > value.start && day < value.end;
            const disabled = past || (blockedDay && !(value.start && !value.end && day > value.start));
            return (
              <Pressable key={j} style={styles.cell} disabled={disabled} onPress={() => pick(day)}>
                <View
                  style={[
                    styles.day,
                    inRange && { backgroundColor: colors.primaryLight },
                    (isStart || isEnd) && { backgroundColor: colors.primary },
                  ]}
                >
                  <Txt
                    style={[
                      { textAlign: 'center' },
                      disabled && { color: colors.border },
                      blockedDay && !past && { textDecorationLine: 'line-through', color: colors.danger },
                      (isStart || isEnd) && { fontWeight: '800' },
                    ]}
                  >
                    {Number(day.slice(8))}
                  </Txt>
                </View>
              </Pressable>
            );
          })}
        </Row>
      ))}
    </View>
  );
}

export function CalendarModal({
  visible,
  value,
  blocked,
  onClose,
  onDone,
}: {
  visible: boolean;
  value: DateRange;
  blocked?: Blocked;
  onClose: () => void;
  onDone: (r: DateRange) => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<DateRange>(value);
  return (
    <Modal visible={visible} animationType="slide" onShow={() => setDraft(value)} onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, padding: spacing.lg, backgroundColor: colors.background }}>
        <Row style={{ justifyContent: 'space-between', marginBottom: spacing.lg }}>
          <IconButton icon="close" onPress={onClose} />
          <Txt variant="subtitle">{t('calendar.title')}</Txt>
          <View style={{ width: 34 }} />
        </Row>
        <Row style={{ marginBottom: spacing.lg }}>
          <View style={styles.dateBox}>
            <Txt variant="small">{t('calendar.pickupDate')}</Txt>
            <Txt style={{ fontWeight: '700' }}>{draft.start ? formatDate(draft.start) : '—'}</Txt>
          </View>
          <View style={styles.dateBox}>
            <Txt variant="small">{t('calendar.returnDate')}</Txt>
            <Txt style={{ fontWeight: '700' }}>{draft.end ? formatDate(draft.end) : '—'}</Txt>
          </View>
        </Row>
        <RangeCalendar value={draft} onChange={setDraft} blocked={blocked} />
        <Txt variant="small" style={{ marginTop: spacing.md }}>
          {draft.start && !draft.end ? t('calendar.pickReturn') : t('calendar.hint')}
        </Txt>
        <View style={{ flex: 1 }} />
        <Row>
          <Button
            title={t('common.clear')}
            variant="secondary"
            onPress={() => setDraft({ start: null, end: null })}
            style={{ flex: 1 }}
          />
          <Button
            title={t('common.done')}
            onPress={() => onDone(draft)}
            disabled={!!draft.start && !draft.end}
            style={{ flex: 1 }}
          />
        </Row>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  weekday: { flex: 1, textAlign: 'center', paddingVertical: 6 },
  cell: { flex: 1, aspectRatio: 1, padding: 2 },
  day: { flex: 1, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  dateBox: { flex: 1, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surface },
});
