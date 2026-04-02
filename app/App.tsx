import {
  SafeAreaProvider,
} from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { RootStackParamList } from './types/navigation';
import HomeScreen from './screens/HomeScreen';
import WelcomeScreen from './screens/WelcomeScreen';
import BillScanScreen from './screens/BillScanScreen';
import { ErrorBoundary } from './components/ErrorBoundary';

const Stack = createNativeStackNavigator<RootStackParamList>();

function App() {
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <NavigationContainer>
          <Stack.Navigator initialRouteName="Welcome">
            <Stack.Screen name="Welcome" options={{ headerShown: false }}>
              {(props) => (
                <WelcomeScreen
                  onGetStarted={() => props.navigation.navigate('Home')}
                />
              )}
            </Stack.Screen>
            <Stack.Screen name="Home" options={{ headerShown: false }}>
              {() => <HomeScreen />}
            </Stack.Screen>
          <Stack.Screen name="BillScan" options={{ headerShown: false }} component={BillScanScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

export default App;