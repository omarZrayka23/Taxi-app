import { useState } from 'react';
import { CloseButton, ScrollArea, SegmentedControl, TextInput } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconSearch } from '@tabler/icons-react';
import { humanize } from '../lib/format';

const ALL = '__ALL__';

interface StatusFilterProps<S extends string> {
  options: readonly S[];
  value: S | null;
  onChange: (value: S | null) => void;
  allLabel?: string;
}

/** Segmented "All / STATUS_A / STATUS_B" filter. `null` means all. */
export function StatusFilter<S extends string>({ options, value, onChange, allLabel = 'All' }: StatusFilterProps<S>) {
  return (
    <ScrollArea type="never" maw="100%">
      <SegmentedControl
        size="sm"
        value={value ?? ALL}
        onChange={(v) => onChange(v === ALL ? null : (v as S))}
        data={[{ value: ALL, label: allLabel }, ...options.map((o) => ({ value: o, label: humanize(o) }))]}
      />
    </ScrollArea>
  );
}

/** Search box state with a debounced value for querying. */
export function useSearch(delay = 350) {
  const [search, setSearch] = useState('');
  const [debounced] = useDebouncedValue(search.trim(), delay);
  return { search, setSearch, debounced };
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search name or phone…',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <TextInput
      w={{ base: '100%', sm: 280 }}
      leftSection={<IconSearch size={16} />}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.currentTarget.value)}
      rightSection={value ? <CloseButton size="sm" onClick={() => onChange('')} aria-label="Clear search" /> : null}
    />
  );
}
