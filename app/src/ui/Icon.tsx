import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { C } from '../lib/theme';

// Line icons in the Lucide style (stroke 1.75, round caps), the same shapes as the design system's Icons card.
type El = ['p', string] | ['c', number, number, number] | ['r', number, number, number, number, number];
const ICONS: Record<string, El[]> = {
  'house': [['p','M3 10.5 12 3l9 7.5'], ['p','M5 9.5V20h14V9.5']],
  'circle-check': [['c',12,12,9], ['p','m8.5 12 2.5 2.5 4.5-5']],
  'users': [['c',9,8,3.5], ['p','M2.5 20a6.5 6.5 0 0 1 13 0'], ['p','M16 4.5a3.5 3.5 0 0 1 0 7'], ['p','M18 14.5a6.5 6.5 0 0 1 3.5 5.5']],
  'tag': [['p','M3 12V4h8l9 9-8 8z'], ['c',7.5,8.5,1.5]],
  'id-card': [['r',3,5,18,14,2.5], ['c',9,11,2.5], ['p','M5.5 17a3.5 3.5 0 0 1 7 0M15 10h3.5M15 13.5h3.5']],
  'calendar': [['r',3.5,5,17,15,2.5], ['p','M3.5 10h17M8 3v4M16 3v4']],
  'calendar-off': [['r',3.5,5,17,15,2.5], ['p','M3.5 10h17M8 3v4M16 3v4M9.5 13.5l5 4M14.5 13.5l-5 4']],
  'file-up': [['p','M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z'], ['p','M14 3v5h5M12 17v-6M9.5 13.5 12 11l2.5 2.5']],
  'settings': [['c',12,12,3], ['p','M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1']],
  'search': [['c',11,11,7], ['p','m20 20-3.5-3.5']],
  'plus': [['p','M12 5v14M5 12h14']],
  'dumbbell': [['p','M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11']],
  'clock': [['c',12,12,9], ['p','M12 7v5l3 2']],
  'wifi-off': [['p','M2 2l20 20'], ['p','M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 5.2-2.8M19 13a10 10 0 0 0-2.4-1.7M2 8.8a15 15 0 0 1 4.2-2.7M22 8.8A15 15 0 0 0 10.7 5'], ['c',12,20,.8]],
  'triangle-alert': [['p','M12 3.5 2.5 20h19z'], ['p','M12 10v4.5M12 17.5v.1']],
  'info': [['c',12,12,9], ['p','M12 11v5.5M12 7.8v.1']],
  'check': [['p','m5 12.5 4.5 4.5L19 7.5']],
  'circle-x': [['c',12,12,9], ['p','m9 9 6 6M15 9l-6 6']],
  'phone': [['p','M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z']],
  'chevron-down': [['p','m6 9 6 6 6-6']],
  'chevron-right': [['p','M9 6l6 6-6 6']],
  'chevron-left': [['p','M15 6l-6 6 6 6']],
  'log-out': [['p','M14 4h4.5a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H14'], ['p','M10 8l-4 4 4 4M6 12h10']],
  'shield': [['p','M12 3 4.5 6v6c0 4.5 3.2 7.8 7.5 9 4.3-1.2 7.5-4.5 7.5-9V6z']],
  'pause': [['r',6.5,5,3.5,14,1], ['r',14,5,3.5,14,1]],
  'wallet': [['r',3,6,18,13,2.5], ['p','M16 12.5h2M3 9.5h18']],
  'mail': [['r',3,5,18,14,2.5], ['p','m4 7 8 6 8-6']],
  'trash-2': [['p','M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13']],
  'inbox': [['p','M3 13h5l1.5 2.5h5L16 13h5'], ['p','M5 5h14l2 8v6H3v-6z']],
  'user-plus': [['c',9,8,3.5], ['p','M2.5 20a6.5 6.5 0 0 1 13 0M19 8v6M16 11h6']],
  'refresh-cw': [['p','M20 11a8 8 0 0 0-14.5-4.5L3 9M3 4v5h5M4 13a8 8 0 0 0 14.5 4.5L21 15M21 20v-5h-5']],
  'eye': [['p','M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z'], ['c',12,12,3]],
  'menu': [['p','M4 7h16M4 12h16M4 17h16']],
  'sun': [['c',12,12,4], ['p','M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4']],
  'moon': [['p','M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z']],
  'monitor': [['r',3,4,18,12,2], ['p','M8 20h8M12 16v4']],
  'user': [['c',12,8,4], ['p','M4 20.5a8 8 0 0 1 16 0']],
  'x': [['p','M6 6l12 12M18 6 6 18']],
  'pencil': [['p','M15.5 4.5l4 4L8 20H4v-4z']],
  'receipt': [['p','M6 3h12v18l-3-2-3 2-3-2-3 2z'], ['p','M9 8h6M9 12h6']],
  'utensils': [['p','M6 3v8a2 2 0 0 0 2 2v8M10 3v8M6 7h4M17 3c-1.7 0-3 2-3 5s1.3 4 3 4v9']],
  'scale': [['r',3.5,3.5,17,17,3], ['p','M8 9.5a5 5 0 0 1 8 0L13 12']],
  'activity': [['p','M3 12h4l3-7 4 14 3-7h4']],
  'camera': [['p','M4 8h3l2-3h6l2 3h3v11H4z'], ['c',12,13,3.5]],
  'flame': [['p','M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2.5 1.5-4 2.5-5 .3 1.5 1 2.5 2.5 3 0-3-1-5.5 0-8z']],
  'message': [['p','M4 5h16v11H9l-5 4z']],
  'sparkles': [['p','M12 4l1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6zM18.5 15l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z']],
  'trending-down': [['p','M3 7l6 6 4-4 8 8M15 17h6v-6']],
  'calendar-days': [['r',3.5,5,17,15,2.5], ['p','M3.5 10h17M8 3v4M16 3v4'], ['r',7,13,3,3,0.8]],
  'bell': [['p','M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z'], ['p','M10 20.5a2 2 0 0 0 4 0']],
  'star': [['p','M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z']],
  'repeat': [['p','M4 9h13l-3-3M20 15H7l3 3']],
  'list': [['p','M9 6h11M9 12h11M9 18h11'], ['c',4.5,6,.8], ['c',4.5,12,.8], ['c',4.5,18,.8]],
};
export type IconName = string;

export function Icon({ name, size = 20, color }: { name: IconName; size?: number; color?: string }) {
  const els = ICONS[name] ?? [];
  const stroke = color ?? C.muted;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      {els.map((e, i) => e[0] === 'p' ? <Path key={i} d={e[1]} />
        : e[0] === 'c' ? <Circle key={i} cx={e[1]} cy={e[2]} r={e[3]} />
        : <Rect key={i} x={e[1]} y={e[2]} width={e[3]} height={e[4]} rx={e[5]} />)}
    </Svg>
  );
}

/** The Tally mark: four strokes and the fifth across, in the current theme's colours */
export function TallyMark({ size = 32, on }: { size?: number; on?: string }) {
  const s = [24, 40, 56, 72];
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" fill="none" strokeLinecap="round">
      {s.map(x => <Path key={x} d={`M${x} 20V80`} stroke={C.fg} strokeWidth={9} />)}
      <Path d="M12 70L88 30" stroke={on ?? C.bg} strokeWidth={20} />
      <Path d="M12 70L88 30" stroke={C.accent} strokeWidth={10} />
    </Svg>
  );
}
