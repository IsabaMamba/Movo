/**
 * The line icons of the 2 November boards, drawn the same way as the tab
 * icons (TabIcon): react-native-svg, a 24-unit grid, one stroke weight, the
 * colour handed in. Kept to what the screens actually use.
 */

import type { ColorValue } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

export type IconName =
  | 'bell'
  | 'crosshair'
  | 'chevronDown'
  | 'chevronRight'
  | 'back'
  | 'share'
  | 'pin'
  | 'calendar'
  | 'route'
  | 'money'
  | 'people'
  | 'repeat'
  | 'check'
  | 'external'
  | 'lock'
  | 'search'
  | 'plus'
  | 'history'
  | 'clipboard'
  | 'shield'
  | 'book'
  | 'download'
  | 'logout'
  | 'camera'
  | 'flag'
  | 'pencil'
  | 'eye'
  | 'hand'
  | 'backspace'
  | 'car'
  | 'link'
  | 'close'
  | 'alert'
  | 'chat'
  | 'send'
  | 'more'
  | 'pinned';

interface Props {
  name: IconName;
  color: ColorValue;
  size?: number;
  strokeWidth?: number;
}

export function Icon({ name, color, size = 20, strokeWidth = 1.8 }: Props) {
  const p = {
    stroke: color,
    strokeWidth,
    fill: 'none' as const,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  return (
    <Svg aria-hidden height={size} viewBox="0 0 24 24" width={size}>
      {name === 'bell' && (
        <Path {...p} d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0" />
      )}
      {name === 'crosshair' && (
        <>
          <Circle {...p} cx="12" cy="12" r="6" />
          <Path {...p} d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4" />
        </>
      )}
      {name === 'chevronDown' && <Path {...p} d="m7 10 5 5 5-5" />}
      {name === 'chevronRight' && <Path {...p} d="m10 7 5 5-5 5" />}
      {name === 'back' && <Path {...p} d="M15 5.5 8.5 12l6.5 6.5" />}
      {name === 'share' && <Path {...p} d="M12 15V4M8 7.5 12 3.5l4 4M6 11v8.5h12V11" />}
      {name === 'pin' && (
        <>
          <Path {...p} d="M12 21s-6.5-6.1-6.5-11a6.5 6.5 0 0 1 13 0c0 4.9-6.5 11-6.5 11z" />
          <Circle {...p} cx="12" cy="10" r="2.4" />
        </>
      )}
      {name === 'calendar' && (
        <>
          <Rect {...p} height="15" rx="2.5" width="16" x="4" y="5.5" />
          <Path {...p} d="M4 10h16M8.5 3.5v4M15.5 3.5v4" />
        </>
      )}
      {name === 'route' && (
        <>
          <Circle {...p} cx="6" cy="18" r="2" />
          <Circle {...p} cx="18" cy="6" r="2" />
          <Path {...p} d="M8 18h7.5a3 3 0 0 0 0-6h-7a3 3 0 0 1 0-6H16" />
        </>
      )}
      {name === 'money' && (
        <>
          <Circle {...p} cx="12" cy="12" r="8.5" />
          <Path
            {...p}
            d="M14.5 9.2c-.5-.8-1.5-1.2-2.5-1.2-1.4 0-2.5.8-2.5 2s1.1 1.6 2.5 2 2.5.8 2.5 2-1.1 2-2.5 2c-1 0-2-.4-2.5-1.2M12 6.5v11"
          />
        </>
      )}
      {name === 'people' && (
        <>
          <Circle {...p} cx="9" cy="8.5" r="3" />
          <Path
            {...p}
            d="M3.5 19c.6-3 2.8-4.6 5.5-4.6s4.9 1.6 5.5 4.6M15.5 6.2a3 3 0 0 1 0 5.6M17 14.5c2 .4 3.3 1.9 3.6 4.5"
          />
        </>
      )}
      {name === 'repeat' && (
        <Path
          {...p}
          d="M17 3.5 20 6.5l-3 3M4 11.5V10a3.5 3.5 0 0 1 3.5-3.5H20M7 20.5 4 17.5l3-3M20 12.5V14a3.5 3.5 0 0 1-3.5 3.5H4"
        />
      )}
      {name === 'check' && <Path {...p} d="m5 12.5 4.5 4.5L19 7.5" />}
      {name === 'external' && (
        <Path {...p} d="M13.5 4.5H19.5V10.5M19.5 4.5l-8 8M17 13.5V19.5H4.5V7H10.5" />
      )}
      {name === 'lock' && (
        <>
          <Rect {...p} height="10" rx="2" width="14" x="5" y="10.5" />
          <Path {...p} d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
        </>
      )}
      {name === 'search' && (
        <>
          <Circle {...p} cx="11" cy="11" r="6.5" />
          <Path {...p} d="m16 16 4.5 4.5" />
        </>
      )}
      {name === 'plus' && <Path {...p} d="M12 5v14M5 12h14" />}
      {name === 'history' && (
        <Path {...p} d="M4 12a8 8 0 1 0 2.4-5.7L4 8.5M4 4v4.5h4.5M12 8v4.5l3 2" />
      )}
      {name === 'clipboard' && (
        <>
          <Rect {...p} height="16" rx="2" width="14" x="5" y="4.5" />
          <Path {...p} d="M9 4.5V3.5h6v1M8.5 10h7M8.5 14h7M8.5 17.5h4" />
        </>
      )}
      {name === 'shield' && (
        <Path {...p} d="M12 3.5 19 6v5.5c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6zM9 12l2.2 2.2L15.5 10" />
      )}
      {name === 'book' && (
        <Path
          {...p}
          d="M5.5 4.5h11a2 2 0 0 1 2 2v13h-11a2 2 0 0 1-2-2zM5.5 17.5a2 2 0 0 1 2-2h11"
        />
      )}
      {name === 'download' && <Path {...p} d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14" />}
      {name === 'logout' && <Path {...p} d="M10 4.5H5.5v15H10M14.5 8l4 4-4 4M18.5 12H9" />}
      {name === 'camera' && (
        <>
          <Path {...p} d="M4 8.5h3.2L9 6h6l1.8 2.5H20v10H4z" />
          <Circle {...p} cx="12" cy="13" r="3.2" />
        </>
      )}
      {name === 'flag' && <Path {...p} d="M6 21V4.5M6 5h11l-2 4 2 4H6" />}
      {name === 'pencil' && <Path {...p} d="M5 19l1-4 10-10 3 3-10 10zM14 7l3 3" />}
      {name === 'eye' && (
        <>
          <Path {...p} d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
          <Circle {...p} cx="12" cy="12" r="3" />
        </>
      )}
      {name === 'hand' && (
        <Path
          {...p}
          d="M8 12V6a1.5 1.5 0 0 1 3 0v5M11 11V4.5a1.5 1.5 0 0 1 3 0V11M14 11V6a1.5 1.5 0 0 1 3 0v7c0 4-2.5 7-6 7-2.6 0-4-1.4-5.6-3.8L4 14a1.5 1.5 0 0 1 2.4-1.8L8 14"
        />
      )}
      {name === 'backspace' && (
        <Path {...p} d="M8.5 5.5H20v13H8.5L3 12zM11.5 9.5l5 5M16.5 9.5l-5 5" />
      )}
      {name === 'car' && (
        <>
          <Path {...p} d="M4 15.5V12l2-5h12l2 5v3.5zM4 12h16" />
          <Circle {...p} cx="7.5" cy="16.5" r="1.5" />
          <Circle {...p} cx="16.5" cy="16.5" r="1.5" />
        </>
      )}
      {name === 'link' && (
        <Path
          {...p}
          d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"
        />
      )}
      {name === 'close' && <Path {...p} d="M6 6l12 12M18 6L6 18" />}
      {name === 'chat' && (
        <Path {...p} d="M5 18.5V7.5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H9z" />
      )}
      {name === 'send' && <Path {...p} d="M5 12h13M13 6.5l5.5 5.5-5.5 5.5" />}
      {name === 'more' && (
        <>
          <Circle cx="6" cy="12" fill={color} r="1.4" />
          <Circle cx="12" cy="12" fill={color} r="1.4" />
          <Circle cx="18" cy="12" fill={color} r="1.4" />
        </>
      )}
      {name === 'pinned' && <Path {...p} d="M9 4h6l-1 6 3 3H7l3-3zM12 13v7" />}
      {name === 'alert' && (
        <>
          <Circle {...p} cx="12" cy="12" r="9" />
          <Path {...p} d="M12 7.5v5.5M12 16.5v.01" />
        </>
      )}
    </Svg>
  );
}
