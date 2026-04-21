import { Tabs } from 'expo-router';
import { StyleSheet, Platform, View } from 'react-native';
import { LayoutGrid, Search, FileText, User } from 'lucide-react-native';
import { Palette, Radius } from '../../constants/Theme';
import { BlurView } from 'expo-blur';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarShowLabel: true,
        tabBarActiveTintColor: '#FFF',
        tabBarInactiveTintColor: 'rgba(255, 255, 255, 0.4)',
        tabBarLabelStyle: styles.tabBarLabel,
        tabBarBackground: () => (
          <BlurView 
            intensity={100} 
            tint="dark" 
            style={StyleSheet.absoluteFill} 
          />
        ),
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Library',
          tabBarIcon: ({ color, focused }) => (
            <View style={focused && styles.activeIconWrap}>
              <LayoutGrid 
                size={22} 
                color={color} 
                strokeWidth={focused ? 2.5 : 2} 
              />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: 'Search',
          tabBarIcon: ({ color, focused }) => (
            <View style={focused && styles.activeIconWrap}>
              <Search 
                size={22} 
                color={color} 
                strokeWidth={focused ? 2.5 : 2} 
              />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'My Scans',
          tabBarIcon: ({ color, focused }) => (
            <View style={focused && styles.activeIconWrap}>
              <FileText 
                size={22} 
                color={color} 
                strokeWidth={focused ? 2.5 : 2} 
              />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }) => (
            <View style={focused && styles.activeIconWrap}>
              <User
                size={22} 
                color={color} 
                strokeWidth={focused ? 2.5 : 2} 
              />
            </View>
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: Platform.OS === 'ios' ? 94 : 72,
    backgroundColor: 'rgba(6, 14, 32, 0.85)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    elevation: 0,
    paddingBottom: Platform.OS === 'ios' ? 32 : 12,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    overflow: 'hidden',
  },
  tabBarLabel: {
    fontFamily: 'Manrope-Bold',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: -4,
  },
  activeIconWrap: {
    shadowColor: '#FFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  }
});
