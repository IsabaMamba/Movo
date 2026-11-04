/**
 * Choosing one sport out of nineteen (Sesión v2 · 1, Deportes v1 · 4).
 *
 * Your sports first, because most people organize what they already play;
 * a search that knows accents and the English names; and «Ver los 19, por
 * familia» for everything else. Somebody with no sports in their profile
 * sees the families straight away. The chosen sport always stays visible,
 * even when it is not one of yours.
 */

import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { byFamily, searchSports } from '../../lib/sports';
import { color, hitSlopFor, size } from '../../theme';
import { FAMILY_NAME, FAMILY_TEXT_COLOR, sportColor } from '../../theme/sport';
import type { Category } from '../../types/database';
import { Icon } from '../nav/Icon';
import { sportPickerStyles as s } from './styles';

const HIT_SLOP = hitSlopFor(size.controlSm);

interface Props {
  categories: Category[];
  selected: string | null;
  onSelect: (id: string) => void;
  /** The person's own sports, shown first. */
  mine?: string[];
  /** Spoken with each chip: what choosing it does. */
  hint?: string;
}

export function SportPicker({ categories, selected, onSelect, mine = [], hint }: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const yours = categories.filter((c) => mine.includes(c.id) || c.id === selected);
  const searching = query.trim() !== '';
  const showAll = open || yours.length === 0;

  const chip = (c: Category) => {
    const on = selected === c.id;
    return (
      <Pressable
        accessibilityRole="radio"
        accessibilityLabel={c.name_es}
        accessibilityHint={hint}
        aria-checked={on}
        hitSlop={HIT_SLOP}
        key={c.id}
        onPress={() => {
          onSelect(c.id);
          setQuery('');
        }}
        style={[s.chip, on && s.chipOn]}
      >
        {on ? (
          <Icon color={color.text.primary} name="check" size={14} strokeWidth={2.4} />
        ) : (
          <View style={[s.dot, { backgroundColor: sportColor(c.id) }]} />
        )}
        <Text style={[s.chipText, on && s.chipTextOn]}>{c.name_es}</Text>
      </Pressable>
    );
  };

  const results = searchSports(categories, query);

  return (
    <View style={s.root}>
      <View style={s.search}>
        <Icon color={color.text.tertiary} name="search" size={16} />
        <TextInput
          accessibilityLabel={`Buscar entre ${categories.length} deportes`}
          onChangeText={setQuery}
          placeholder={`Busca entre ${categories.length} deportes`}
          placeholderTextColor={color.text.tertiary}
          style={s.searchInput}
          value={query}
        />
      </View>

      {searching ? (
        results.length === 0 ? (
          <Text style={s.empty}>Ningún deporte se llama así.</Text>
        ) : (
          <View accessibilityRole="radiogroup" accessibilityLabel="Deporte" style={s.row}>
            {results.map(chip)}
          </View>
        )
      ) : (
        <>
          {yours.length > 0 && (
            <View style={s.group}>
              <Text style={s.groupLabel}>Tus deportes</Text>
              <View accessibilityRole="radiogroup" accessibilityLabel="Tus deportes" style={s.row}>
                {yours.map(chip)}
              </View>
            </View>
          )}

          {showAll ? (
            byFamily(categories.filter((c) => !yours.includes(c))).map(({ family, sports }) => (
              <View key={family} style={s.group}>
                <Text style={[s.familyLabel, { color: FAMILY_TEXT_COLOR[family] }]}>
                  {FAMILY_NAME[family].toUpperCase()}
                </Text>
                <View
                  accessibilityRole="radiogroup"
                  accessibilityLabel={FAMILY_NAME[family]}
                  style={s.row}
                >
                  {sports.map(chip)}
                </View>
              </View>
            ))
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Ver los ${categories.length} deportes, por familia`}
              onPress={() => {
                setOpen(true);
              }}
              style={s.more}
            >
              <Text style={s.moreText}>Ver los {categories.length}, por familia</Text>
              <Icon color={color.accent.cool} name="chevronRight" size={14} />
            </Pressable>
          )}
        </>
      )}
    </View>
  );
}
