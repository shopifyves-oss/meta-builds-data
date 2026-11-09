import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { BackHandler, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import HomeScreen from './src/screens/HomeScreen';
import SpecScreen from './src/screens/SpecScreen';
import CharacterScreen from './src/screens/CharacterScreen';
import { colors } from './src/theme';

type Route = { name: 'home' } | { name: 'character'; who?: { region: string; realm: string; name: string } } | { name: 'spec'; cls: string; spec: string; from?: 'character' };

export default function App() {
  const [route, setRoute] = useState<Route>({ name: 'home' });
  const lastWho = React.useRef<{ region: string; realm: string; name: string } | undefined>(undefined);
  if (route.name === 'character' && route.who) lastWho.current = route.who;

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
            <HomeScreen onOpen={(cls, spec) => setRoute({ name: 'spec', cls, spec })} onCharacter={(who) => setRoute({ name: 'character', who: who && { region: who.region, realm: who.realm, name: who.name } })} />
          ) : route.name === 'character' ? (
            <CharacterScreen key={route.who ? `${route.who.realm}/${route.who.name}` : 'new'} initial={route.who} onSearched={(w) => { lastWho.current = w; }} onBack={() => setRoute({ name: 'home' })} onOpenSpec={(cls, spec) => setRoute({ name: 'spec', cls, spec, from: 'character' })} />
          ) : (
            <SpecScreen key={`${route.cls}-${route.spec}`} cls={route.cls} spec={route.spec} onBack={() => setRoute(route.from === 'character' ? { name: 'character', who: lastWho.current } : { name: 'home' })} />
          )}
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
