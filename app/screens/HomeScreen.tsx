import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Alert,
  ScrollView,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import {
  launchCamera,
  launchImageLibrary,
  ImagePickerResponse,
} from 'react-native-image-picker';
import { ArrowLeft, Camera } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';

export default function HomeScreen() {
  const loading = false;
  const navigation = useNavigation<any>();

  const handleImageResponse = async (response: ImagePickerResponse) => {
    if (response.didCancel) return;

    if (response.errorCode) {
      console.error('ImagePicker Error:', response.errorMessage);
      Alert.alert('Error', 'Something went wrong while selecting image.');
      return;
    }

    const uri = response.assets?.[0]?.uri;

    if (!uri) {
      Alert.alert('Error', 'No image selected.');
      return;
    }

    navigation.navigate('BillScan', { imageUri: uri });
  };

  const takePhoto = async () => {
    try {
      launchCamera(
        {
          mediaType: 'photo',
          quality: 0.8,
          cameraType: 'back',
          saveToPhotos: false,
        },
        handleImageResponse
      );
    } catch (error) {
      console.error('Camera Error:', error);
      Alert.alert('Error', 'Failed to open camera.');
    }
  };

  const pickImage = async () => {
    try {
      launchImageLibrary(
        {
          mediaType: 'photo',
          quality: 0.8,
          selectionLimit: 1,
        },
        handleImageResponse
      );
    } catch (error) {
      console.error('Gallery Error:', error);
      Alert.alert('Error', 'Failed to open gallery.');
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <ArrowLeft size={24} color="#3B82F6" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Scan Bill</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.welcomeText}>Welcome to Splito!</Text>

        <Text style={styles.instructionText}>
          Capture or upload a receipt to split expenses with friends.
        </Text>

        {/* 📸 Camera Button */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[
              styles.actionButton,
              styles.cameraButton,
              loading && styles.buttonDisabled,
            ]}
            onPress={takePhoto}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" size={20} />
            ) : (
              <>
                <Camera size={24} color="#FFFFFF" />
                <Text style={styles.buttonText}>Take Photo</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* 🖼️ Gallery Button */}
        <TouchableOpacity
          style={styles.manualButton}
          onPress={pickImage}
          disabled={loading}
        >
          <Text style={styles.manualButtonText}>Pick from Gallery</Text>
        </TouchableOpacity>


      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f3efc8',
  },
  manualButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
  },
  manualButtonText: {
    fontSize: 16,
    color: '#3B82F6',
    marginLeft: 8,
  },
  welcomeText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  actionButton: {
    backgroundColor: '#3B82F6',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 120,
  },
  cameraButton: {
    backgroundColor: '#3B82F6',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 32,
  },
  buttonText: {
    fontSize: 16,
    color: '#FFFFFF',
    marginTop: 8,
  },
instructionText: {
    fontSize: 16,
    color: '#666',
    marginBottom: 32,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginTop: 50,
  },
  content: {
    padding: 16,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#3B82F6',
  },
  placeholder: {
    width: 40,
  },
});
