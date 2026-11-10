import React from 'react';
import {
  ActivityIndicator,
  I18nManager,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type RefreshControlProps,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, font, radius, spacing } from '@/theme';
import { errorMessage, formatLbp, formatUsd, usdToLbp } from '@/lib/format';
import { useAppConfig } from '@/api/queries';

export type IconName = React.ComponentProps<typeof Ionicons>['name'];

// ---------- Layout ----------

export function Screen({
  children,
  scroll,
  padded = true,
  edges = ['bottom'],
  refreshControl,
  style,
  contentStyle,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
  edges?: Edge[];
  refreshControl?: React.ReactElement<RefreshControlProps>;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const pad = padded ? { padding: spacing.lg } : null;
  return (
    <SafeAreaView edges={edges} style={[styles.screen, style]}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[pad, { paddingBottom: spacing.xxl }, contentStyle]}
          keyboardShouldPersistTaps="handled"
          refreshControl={refreshControl}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, pad, contentStyle]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function Row({
  children,
  style,
  gap = spacing.sm,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  gap?: number;
}) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

export function Spacer({ size = spacing.md }: { size?: number }) {
  return <View style={{ height: size }} />;
}

// ---------- Text ----------

type Variant = 'title' | 'subtitle' | 'body' | 'muted' | 'small' | 'label';

export function Txt({ variant = 'body', style, ...rest }: TextProps & { variant?: Variant }) {
  return <Text {...rest} style={[styles.textBase, textVariants[variant], style]} />;
}

const textVariants: Record<Variant, TextStyle> = {
  title: { fontSize: font.xxl, fontWeight: '700' },
  subtitle: { fontSize: font.lg, fontWeight: '600' },
  body: { fontSize: font.md },
  muted: { fontSize: font.md, color: colors.textMuted },
  small: { fontSize: font.sm, color: colors.textMuted },
  label: { fontSize: font.sm, fontWeight: '600', color: colors.textMuted, marginBottom: spacing.xs },
};

export function SectionTitle({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return (
    <Txt variant="subtitle" style={[{ marginTop: spacing.lg, marginBottom: spacing.sm }, style]}>
      {children}
    </Txt>
  );
}

// ---------- Buttons ----------

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success' | 'dark';

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  icon,
  small,
  style,
}: {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  icon?: IconName;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const v = buttonVariants[variant];
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        small && styles.buttonSmall,
        { backgroundColor: v.bg, borderColor: v.border },
        pressed && { opacity: 0.8 },
        isDisabled && { opacity: 0.5 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.fg} />
      ) : (
        <Row gap={spacing.sm} style={{ justifyContent: 'center' }}>
          {icon ? <Ionicons name={icon} size={small ? 16 : 20} color={v.fg} /> : null}
          <Text style={[styles.buttonText, small && { fontSize: font.sm }, { color: v.fg }]}>{title}</Text>
        </Row>
      )}
    </Pressable>
  );
}

const buttonVariants: Record<ButtonVariant, { bg: string; fg: string; border: string }> = {
  primary: { bg: colors.primary, fg: colors.onPrimary, border: colors.primary },
  secondary: { bg: colors.white, fg: colors.text, border: colors.border },
  danger: { bg: colors.white, fg: colors.danger, border: colors.danger },
  ghost: { bg: 'transparent', fg: colors.text, border: 'transparent' },
  success: { bg: colors.success, fg: colors.white, border: colors.success },
  dark: { bg: colors.text, fg: colors.white, border: colors.text },
};

export function IconButton({
  icon,
  onPress,
  color = colors.text,
  size = 22,
  style,
  label,
}: {
  icon: IconName;
  onPress?: () => void;
  color?: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
  label?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.6 }, style]}
    >
      <Ionicons name={icon} size={size} color={color} />
    </Pressable>
  );
}

// ---------- Inputs ----------

export function TextField({
  label,
  error,
  style,
  ltr,
  ...rest
}: TextInputProps & { label?: string; error?: string | null; ltr?: boolean }) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      {label ? <Txt variant="label">{label}</Txt> : null}
      <TextInput
        placeholderTextColor={colors.textMuted}
        {...rest}
        style={[
          styles.input,
          { textAlign: ltr ? 'left' : I18nManager.isRTL ? 'right' : 'left' },
          ltr && { writingDirection: 'ltr' },
          rest.multiline && { minHeight: 80, textAlignVertical: 'top' },
          !!error && { borderColor: colors.danger },
          style,
        ]}
      />
      {error ? <Txt style={{ color: colors.danger, fontSize: font.sm, marginTop: 2 }}>{error}</Txt> : null}
    </View>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  icon,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: IconName;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, selected && { backgroundColor: colors.primary, borderColor: colors.primary }]}
    >
      <Row gap={4}>
        {icon ? <Ionicons name={icon} size={14} color={colors.text} /> : null}
        <Text style={[styles.chipText, selected && { fontWeight: '700' }]}>{label}</Text>
      </Row>
    </Pressable>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.segmented}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={[styles.segment, active && { backgroundColor: colors.primary }]}
          >
            <Text style={[styles.segmentText, active && { fontWeight: '700' }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function SwitchRow({
  label,
  value,
  onChange,
  description,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  description?: string;
}) {
  return (
    <Pressable onPress={() => onChange(!value)} style={styles.switchRow}>
      <View style={{ flex: 1 }}>
        <Txt style={{ fontWeight: '600' }}>{label}</Txt>
        {description ? <Txt variant="small">{description}</Txt> : null}
      </View>
      <Ionicons
        name={value ? 'checkbox' : 'square-outline'}
        size={26}
        color={value ? colors.primaryDark : colors.textMuted}
      />
    </Pressable>
  );
}

// ---------- Containers ----------

export function Card({
  children,
  style,
  onPress,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
}) {
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }, style]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

export function KeyValue({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <View style={styles.kv}>
      <Txt variant="muted" style={{ flexShrink: 0 }}>
        {label}
      </Txt>
      {typeof value === 'string' || typeof value === 'number' ? (
        <Txt style={{ fontWeight: '600', flexShrink: 1, textAlign: 'right' }}>{value}</Txt>
      ) : (
        value
      )}
    </View>
  );
}

export function ListRow({
  icon,
  title,
  subtitle,
  onPress,
  right,
}: {
  icon?: IconName;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  right?: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.listRow, pressed && { opacity: 0.7 }]}
    >
      {icon ? <Ionicons name={icon} size={22} color={colors.text} /> : null}
      <View style={{ flex: 1 }}>
        <Txt style={{ fontWeight: '600' }}>{title}</Txt>
        {subtitle ? <Txt variant="small">{subtitle}</Txt> : null}
      </View>
      {right ??
        (onPress ? (
          <Ionicons name={I18nManager.isRTL ? 'chevron-back' : 'chevron-forward'} size={18} color={colors.textMuted} />
        ) : null)}
    </Pressable>
  );
}

// ---------- Status ----------

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

const toneColors: Record<Tone, { bg: string; fg: string }> = {
  neutral: { bg: colors.surface, fg: colors.text },
  info: { bg: colors.infoLight, fg: colors.info },
  success: { bg: colors.successLight, fg: colors.success },
  warning: { bg: colors.primaryLight, fg: '#8A6100' },
  danger: { bg: colors.dangerLight, fg: colors.danger },
};

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: Tone }) {
  const c = toneColors[tone];
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]}>
      <Text style={{ color: c.fg, fontSize: 12, fontWeight: '700' }}>{label}</Text>
    </View>
  );
}

const statusTones: Record<string, Tone> = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
  SUSPENDED: 'danger',
  REQUESTED: 'warning',
  ACCEPTED: 'info',
  ARRIVED: 'info',
  IN_PROGRESS: 'info',
  COMPLETED: 'success',
  CANCELLED: 'danger',
  EXPIRED: 'neutral',
  CONFIRMED: 'info',
  ACTIVE: 'success',
};

export function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  return <Badge label={t(`status.${status}`, { defaultValue: status })} tone={statusTones[status] ?? 'neutral'} />;
}

export function Banner({
  tone = 'info',
  title,
  message,
  icon,
}: {
  tone?: Tone;
  title?: string;
  message?: string;
  icon?: IconName;
}) {
  const c = toneColors[tone];
  return (
    <View style={[styles.banner, { backgroundColor: c.bg }]}>
      {icon ? <Ionicons name={icon} size={22} color={c.fg} /> : null}
      <View style={{ flex: 1 }}>
        {title ? <Text style={{ color: c.fg, fontWeight: '700', fontSize: font.md }}>{title}</Text> : null}
        {message ? <Text style={{ color: c.fg, fontSize: font.sm, marginTop: title ? 2 : 0 }}>{message}</Text> : null}
      </View>
    </View>
  );
}

// ---------- States ----------

export function LoadingView({ label }: { label?: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={colors.primaryDark} />
      {label ? (
        <Txt variant="muted" style={{ marginTop: spacing.md }}>
          {label}
        </Txt>
      ) : null}
    </View>
  );
}

export function ErrorView({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useTranslation();
  return (
    <View style={styles.center}>
      <Ionicons name="cloud-offline-outline" size={44} color={colors.textMuted} />
      <Txt style={{ marginTop: spacing.md, textAlign: 'center' }}>{errorMessage(error)}</Txt>
      {onRetry ? <Button title={t('common.retry')} onPress={onRetry} small style={{ marginTop: spacing.lg }} /> : null}
    </View>
  );
}

export function EmptyView({
  title,
  message,
  icon = 'file-tray-outline',
}: {
  title: string;
  message?: string;
  icon?: IconName;
}) {
  return (
    <View style={styles.center}>
      <Ionicons name={icon} size={44} color={colors.textMuted} />
      <Txt variant="subtitle" style={{ marginTop: spacing.md, textAlign: 'center' }}>
        {title}
      </Txt>
      {message ? (
        <Txt variant="muted" style={{ textAlign: 'center', marginTop: spacing.xs }}>
          {message}
        </Txt>
      ) : null}
    </View>
  );
}

// ---------- Domain bits ----------

export function Stars({
  value,
  onChange,
  size = 30,
}: {
  value: number;
  onChange?: (v: number) => void;
  size?: number;
}) {
  return (
    <Row gap={6} style={{ justifyContent: 'center' }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable key={n} onPress={onChange ? () => onChange(n) : undefined} hitSlop={4} disabled={!onChange}>
          <Ionicons name={n <= value ? 'star' : 'star-outline'} size={size} color={colors.primaryDark} />
        </Pressable>
      ))}
    </Row>
  );
}

export function Rating({ value }: { value: number | null | undefined }) {
  return (
    <Row gap={2}>
      <Ionicons name="star" size={14} color={colors.primaryDark} />
      <Txt variant="small" style={{ color: colors.text, fontWeight: '600' }}>
        {value != null ? Number(value).toFixed(1) : '—'}
      </Txt>
    </Row>
  );
}

/** USD price with LBP below. Computes LBP from /config when not supplied. */
export function Price({
  usd,
  lbp,
  size = 'md',
  align = 'auto',
}: {
  usd: number | null | undefined;
  lbp?: number | null;
  size?: 'sm' | 'md' | 'lg';
  align?: 'auto' | 'center';
}) {
  const { data: config } = useAppConfig();
  const lbpValue = lbp ?? usdToLbp(usd, config?.lbpRate);
  const usdSize = size === 'lg' ? 28 : size === 'md' ? font.lg : font.md;
  return (
    <View style={align === 'center' ? { alignItems: 'center' } : undefined}>
      <Text style={{ fontSize: usdSize, fontWeight: '800', color: colors.text }}>{formatUsd(usd)}</Text>
      {lbpValue != null ? (
        <Text style={{ fontSize: font.sm, color: colors.textMuted }}>{formatLbp(lbpValue)}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  textBase: { color: colors.text, textAlign: 'left' },
  button: {
    minHeight: 50,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonSmall: { minHeight: 38, paddingHorizontal: spacing.md },
  buttonText: { fontSize: font.md, fontWeight: '700' },
  iconButton: { padding: 6, alignItems: 'center', justifyContent: 'center' },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: font.md,
    color: colors.text,
    backgroundColor: colors.white,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  chipText: { fontSize: font.sm, color: colors.text },
  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 3,
  },
  segment: { flex: 1, paddingVertical: 9, borderRadius: radius.sm, alignItems: 'center' },
  segmentText: { fontSize: font.sm, color: colors.text },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  kv: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 6,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, alignSelf: 'flex-start' },
  banner: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
});
