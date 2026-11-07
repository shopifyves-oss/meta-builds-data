import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { BackHandler, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import HomeScreen from './src/screens/HomeScreen';
import SpecScreen from './src/screens/SpecScreen';
import CharacterScreen from './src/screens/CharacterScreen';
import { colors } from './src/theme';

type Route = { name: 'home' } | { name: 'character' } | { name: 'spec'; cls: string; spec: string; from?: 'character' };

export default function App() {
  const [route, setRoute] = useState<Route>({ name: 'home' });

  // Android: бутонът „назад“ връща към началото
  React.useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (route.name !== 'home') { setRoute({ name: 'home' }); return true; }
      return false;
    });
    return () => sub.remove();
  }, [route]);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'left', 'right']}>
        <StatusBar style="light" />
        <View style={{ flex: 1 }}>
          {route.name === 'home' ? (
            <HomeScreen onOpen={(cls, spec) => setRoute({ name: 'spec', cls, spec })} onCharacter={() => setRoute({ name: 'character' })} />
          ) : route.name === 'character' ? (
            <CharacterScreen onBack={() => setRoute({ name: 'home' })} onOpenSpec={(cls, spec) => setRoute({ name: 'spec', cls, spec, from: 'character' })} />
          ) : (
            <SpecScreen key={`${route.cls}-${route.spec}`} cls={route.cls} spec={route.spec} onBack={() => setRoute(route.from === 'character' ? { name: 'character' } : { name: 'home' })} />
          )}
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
