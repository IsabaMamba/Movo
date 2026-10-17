/**
 * The five tab icons, drawn rather than imported: react-native-svg is
 * already here for the heat map, and an icon font for five glyphs would be
 * the heaviest thing in the bundle. Simple strokes, 24-unit grid, the
 * colour the tab bar hands in.
 */

import type { ColorValue } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

export type TabIconName = 'descubrir' | 'sesiones' | 'crear' | 'grupos' | 'perfil';

interface Props {
  name: TabIconName;
  color: ColorValue;
  size?: number;
}

export function TabIcon({ name, color, size = 24 }: Props) {
  const stroke = { stroke: color, strokeWidth: 1.8, fill: 'none' as const };
  return (
    <Svg height={size} viewBox="0 0 24 24" width={size}>
      {name === 'descubrir' && (
        // A folded map.
        <Path
          {...stroke}
          d="M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20zM9 4v13.5M15 6.5V20"
          strokeLinejoin="round"
        />
      )}
      {name === 'sesiones' && (
        <>
          <Rect {...stroke} height="16" rx="2.5" width="17" x="3.5" y="5" />
          <Path {...stroke} d="M3.5 10h17M8 3v4M16 3v4" strokeLinecap="round" />
        </>
      )}
      {name === 'crear' && <Path {...stroke} d="M12 6v12M6 12h12" strokeLinecap="round" />}
      {name === 'grupos' && (
        <>
          <Circle {...stroke} cx="9" cy="8.5" r="3" />
          <Circle {...stroke} cx="16.5" cy="9.5" r="2.4" />
          <Path
            {...stroke}
            d="M3.5 19c.6-3 2.8-4.6 5.5-4.6s4.9 1.6 5.5 4.6M14.5 14.6c.6-.2 1.3-.3 2-.3 2.2 0 3.8 1.3 4.3 3.7"
            strokeLinecap="round"
          />
        </>
      )}
      {name === 'perfil' && (
        <>
          <Circle {...stroke} cx="12" cy="8.5" r="3.6" />
          <Path {...stroke} d="M5 20c.8-3.6 3.6-5.6 7-5.6s6.2 2 7 5.6" strokeLinecap="round" />
        </>
      )}
    </Svg>
  );
}
