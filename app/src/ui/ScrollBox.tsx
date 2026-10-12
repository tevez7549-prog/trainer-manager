import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { C, R } from '../lib/theme';

/**
 * A short box that scrolls on its own, with a slim always-visible bar on the right showing where you are
 * (phones hide the normal scroll bar until you touch it). Use for long result lists inside a page.
 */
export function ScrollBox({ maxHeight, children, onNearEnd }: { maxHeight: number; children: React.ReactNode; onNearEnd?: () => void }) {
  const [box, setBox] = useState(0);
  const [content, setContent] = useState(0);
  const [y, setY] = useState(0);
  const scrolls = content > box + 1 && box > 0;
  const thumb = scrolls ? Math.max(28, (box / content) * box) : 0;
  const top = scrolls ? (y / (content - box)) * (box - thumb) : 0;
  return (
    <View style={{ maxHeight, position: 'relative' }}>
      <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false} scrollEventThrottle={16}
        onLayout={e => setBox(e.nativeEvent.layout.height)} onContentSizeChange={(_w, h) => setContent(h)}
        onScroll={e => { const ny = e.nativeEvent.contentOffset.y; setY(ny); if (onNearEnd && ny + box > content - 300) onNearEnd(); }} style={{ maxHeight }} contentContainerStyle={{ paddingRight: scrolls ? 10 : 0 }}>
        {children}
      </ScrollView>
      {scrolls ? (
        <View pointerEvents="none" style={{ position: 'absolute', right: 0, top: 4, bottom: 4, width: 4, borderRadius: R.pill, backgroundColor: C.line }}>
          <View style={{ position: 'absolute', left: 0, right: 0, top: Math.min(Math.max(0, top), box - thumb - 8), height: thumb, borderRadius: R.pill, backgroundColor: C.accent }} />
        </View>
      ) : null}
    </View>
  );
}
