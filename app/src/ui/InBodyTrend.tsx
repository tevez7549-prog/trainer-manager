import { useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg';
import { C, F } from '../lib/theme';
import { fmt1 } from '../lib/me';
import { Chips, Txt } from './index';

export type TrendScan = { id: string; measured_at: string; weight_kg: number | null; smm_kg: number | null; pbf: number | null };

const ROWS: { k: 'weight_kg' | 'smm_kg' | 'pbf'; t: string; unit: string; color: () => string }[] = [
  { k: 'weight_kg', t: 'น้ำหนัก', unit: 'kg', color: () => C.fg },
  { k: 'smm_kg', t: 'มวลกล้ามเนื้อโครงร่าง', unit: 'kg', color: () => C.accent },
  { k: 'pbf', t: 'เปอร์เซ็นต์ไขมันในร่างกาย', unit: '%', color: () => C.warnFg },
];
const ROW_H = 74;     // chart height per metric
const MIN_COL = 40;   // narrowest column before the chart scrolls sideways (8 tests fit a 320 px phone)
const LABEL_H = 22;

/**
 * Like the history block on the InBody printout: weight, skeletal muscle and body-fat % as three lines
 * over the same dates, every point labelled. "Recent" = the last 8 tests, "All" scrolls sideways.
 */
export function InBodyTrend({ scans }: { scans: TrendScan[] }) {
  const [mode, setMode] = useState<'recent' | 'all'>('recent');
  const [w, setW] = useState(0);
  const scroll = useRef<ScrollView>(null);
  const asc = [...scans].sort((a, b) => a.measured_at.localeCompare(b.measured_at));
  const pts = mode === 'recent' ? asc.slice(-8) : asc;
  const n = pts.length;
  const col = n ? (mode === 'recent' ? w / n : Math.max(MIN_COL, w / n)) : 0;
  const total = col * n;
  useEffect(() => { setTimeout(() => scroll.current?.scrollToEnd({ animated: false }), 0); }, [mode, n, w]);
  if (n < 2) return null;

  const d = (iso: string) => { const t = new Date(iso); return { dm: `${t.getDate()}/${t.getMonth() + 1}`, y: String(t.getFullYear()).slice(2) }; };

  return (
    <View style={{ gap: 8 }} onLayout={e => setW(e.nativeEvent.layout.width)}>
      <Txt bold size={14}>ประวัติการวัดองค์ประกอบของร่างกาย</Txt>
      {asc.length > 8 ? <Chips options={[{ v: 'recent', t: 'ล่าสุด 8 ครั้ง' }, { v: 'all', t: `ทั้งหมด (${asc.length})` }]} value={mode} onChange={setMode} /> : null}
      {w > 0 ? <View>
        <ScrollView ref={scroll} horizontal showsHorizontalScrollIndicator={total > w} scrollEnabled={total > w}>
          <View style={{ width: total }}>
            {ROWS.map(r => {
              const vals = pts.map(p => (p[r.k] == null ? null : Number(p[r.k])));
              const have = vals.filter((v): v is number => v != null);
              if (!have.length) return null;
              const lo = Math.min(...have), hi = Math.max(...have), span = hi - lo || 1;
              const top = 22, bottom = 10, ih = ROW_H - top - bottom;
              const y = (v: number) => top + (1 - (v - lo) / span) * ih;
              const xs = (i: number) => col * i + col / 2;
              const line = vals.map((v, i) => (v == null ? null : `${xs(i)},${y(v)}`)).filter(Boolean).join(' ');
              const color = r.color();
              return (
                <View key={r.k} style={{ borderTopWidth: 1, borderTopColor: C.line, paddingTop: LABEL_H }}>
                  <Svg width={total} height={ROW_H} accessibilityLabel={`${r.t} ${vals.map((v, i) => `${d(pts[i].measured_at).dm} ${v == null ? '–' : fmt1(v)}`).join(', ')}`}>
                    {pts.map((_, i) => i > 0 ? <Line key={i} x1={col * i} x2={col * i} y1={0} y2={ROW_H} stroke={C.line} strokeDasharray="3 4" strokeWidth={1} /> : null)}
                    <Polyline points={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
                    {vals.map((v, i) => v == null ? null : (
                      <Circle key={`c${i}`} cx={xs(i)} cy={y(v)} r={i === n - 1 ? 4.5 : 3.5} fill={i === n - 1 ? color : C.surface} stroke={color} strokeWidth={2} />
                    ))}
                    {vals.map((v, i) => v == null ? null : (
                      <SvgText key={`t${i}`} x={xs(i)} y={y(v) - 8} fontSize={col < 40 ? 11 : 12.5} fontWeight={i === n - 1 ? '700' : '500'} fontFamily={F.body}
                        fill={i === n - 1 ? color : C.fg} textAnchor="middle">{v.toFixed(1)}</SvgText>
                    ))}
                  </Svg>
                </View>
              );
            })}
            <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: C.line, paddingTop: 4 }}>
              {pts.map(p => {
                const t = d(p.measured_at);
                return (
                  <View key={p.id} style={{ width: col, alignItems: 'center' }}>
                    <Txt size={12} muted>{t.dm}</Txt>
                    <Txt size={11} muted>{t.y}</Txt>
                  </View>
                );
              })}
            </View>
          </View>
        </ScrollView>
        {/* metric names stay put while the chart scrolls */}
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0 }}>
          {ROWS.filter(r => pts.some(p => p[r.k] != null)).map(r => (
            <View key={r.k} style={{ height: ROW_H + LABEL_H + 1, paddingTop: 3 }}>
              <Txt size={12.5} muted style={{ backgroundColor: C.surface, paddingRight: 6 }}>{`${r.t} (${r.unit})`}</Txt>
            </View>
          ))}
        </View>
      </View> : null}
    </View>
  );
}
