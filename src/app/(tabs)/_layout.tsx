/**
 * The tab bar (16 October boards): Descubrir · Mis sesiones · Crear ·
 * Grupos · Perfil.
 *
 * Until now the only way between screens was a row of links in Descubrir's
 * header. Every board from 16 October is drawn with this bar, so it comes
 * before the screens that assume it.
 *
 * A route group: the five screens keep their addresses (`/`, `/mis-sesiones`,
 * `/crear`, `/grupos`, `/cuenta`), so no link or notice breaks. Everything
 * else — a session, the roster, /avisos — opens above the bar from the root
 * Stack, and its back button returns to the tab it came from.
 *
 * Perfil is /cuenta for now; Perfil v2 (photo, public profile) replaces its
 * contents later, not its place. Organizar is a row inside it.
 */

import { Tabs } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { TabIcon, type TabIconName } from '../../features/nav/TabIcon';
import { color, size, type } from '../../theme';

const TABS: { name: string; title: string; icon: TabIconName }[] = [
  { name: 'index', title: 'Descubrir', icon: 'descubrir' },
  { name: 'mis-sesiones', title: 'Mis sesiones', icon: 'sesiones' },
  { name: 'crear', title: 'Crear', icon: 'crear' },
  { name: 'grupos', title: 'Grupos', icon: 'grupos' },
  { name: 'cuenta', title: 'Perfil', icon: 'perfil' },
];

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: color.bg.base },
        tabBarActiveTintColor: color.accent.primary,
        tabBarInactiveTintColor: color.text.tertiary,
        tabBarLabelStyle: { ...type.caption, fontSize: 11 },
        tabBarStyle: styles.bar,
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarAccessibilityLabel: tab.title,
            tabBarIcon: ({ color: tint, focused }) =>
              tab.icon === 'crear' ? (
                // The one filled control in the bar, as on the boards: Sun,
                // with the inverse ink it is always paired with.
                <View style={[styles.create, focused && styles.createFocused]}>
                  <TabIcon color={color.text.inverse} name="crear" size={22} />
                </View>
              ) : (
                <TabIcon color={tint} name={tab.icon} />
              ),
          }}
        />
      ))}
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: color.bg.surface,
    borderTopColor: color.border.default,
    height: size.tabBar,
    paddingBottom: 6,
    paddingTop: 6,
  },
  create: {
    alignItems: 'center',
    backgroundColor: color.accent.primary,
    borderRadius: 16,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  createFocused: { borderColor: color.text.primary, borderWidth: 2 },
});
