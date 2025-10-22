/**
 * ProfileScreen.tsx - User Profile and App Information
 * 
 * Displays app version, backend connectivity status, and settings
 */
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { apiClient } from '../api/client';

interface ApiConfig {
  api_version: string;
  min_app_version: string;
  features: Record<string, boolean>;
  support_phone: string;
}

export default function ProfileScreen() {
  const [apiConfig, setApiConfig] = useState<ApiConfig | null>(null);
  const [healthStatus, setHealthStatus] = useState<'checking' | 'healthy' | 'error'>('checking');

  useEffect(() => {
    checkBackendHealth();
    fetchApiConfig();
  }, []);

  const checkBackendHealth = async () => {
    try {
      await apiClient.get('/health');
      setHealthStatus('healthy');
    } catch (error) {
      setHealthStatus('error');
    }
  };

  const fetchApiConfig = async () => {
    try {
      const response = await apiClient.get('/api/v1/config');
      setApiConfig(response.data);
    } catch (error) {
      console.error('Failed to fetch API config:', error);
    }
  };

  const handleTestConnection = async () => {
    setHealthStatus('checking');
    await checkBackendHealth();
    
    if (healthStatus === 'healthy') {
      Alert.alert('Success', 'Backend connection is healthy');
    } else {
      Alert.alert('Error', 'Failed to connect to backend');
    }
  };

  const renderInfoRow = (label: string, value: string, iconName: keyof typeof Ionicons.glyphMap) => (
    <View style={styles.infoRow}>
      <View style={styles.infoLeft}>
        <Ionicons name={iconName} size={20} color="#007AFF" />
        <Text style={styles.infoLabel}>{label}</Text>
      </View>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );

  return (
    <ScrollView style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>App Information</Text>
        
        {renderInfoRow(
          'App Version',
          Constants.expoConfig?.version || '1.0.0',
          'phone-portrait-outline'
        )}
        
        {renderInfoRow(
          'Build Number',
          Constants.expoConfig?.ios?.buildNumber || 
          Constants.expoConfig?.android?.versionCode?.toString() || '1',
          'code-slash-outline'
        )}
        
        {apiConfig && renderInfoRow(
          'API Version',
          apiConfig.api_version,
          'server-outline'
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Backend Status</Text>
        
        <TouchableOpacity
          style={styles.statusCard}
          onPress={handleTestConnection}
        >
          <View style={styles.statusHeader}>
            <Text style={styles.statusLabel}>Connection Status</Text>
            {healthStatus === 'checking' ? (
              <ActivityIndicator size="small" color="#007AFF" />
            ) : (
              <View
                style={[
                  styles.statusIndicator,
                  {
                    backgroundColor:
                      healthStatus === 'healthy' ? '#34C759' : '#FF3B30',
                  },
                ]}
              />
            )}
          </View>
          <Text style={styles.statusText}>
            {healthStatus === 'healthy' ? 'Connected' : 
             healthStatus === 'checking' ? 'Checking...' : 
             'Disconnected'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionButton} onPress={handleTestConnection}>
          <Ionicons name="refresh-outline" size={20} color="#007AFF" />
          <Text style={styles.actionButtonText}>Test Connection</Text>
        </TouchableOpacity>
      </View>

      {apiConfig && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Features</Text>
          {Object.entries(apiConfig.features).map(([feature, enabled]) => (
            <View key={feature} style={styles.featureRow}>
              <Text style={styles.featureName}>
                {feature.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
              </Text>
              <View
                style={[
                  styles.featureBadge,
                  { backgroundColor: enabled ? '#34C759' : '#8E8E93' },
                ]}
              >
                <Text style={styles.featureBadgeText}>
                  {enabled ? 'Enabled' : 'Disabled'}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Support</Text>
        
        {apiConfig && (
          <View style={styles.infoRow}>
            <View style={styles.infoLeft}>
              <Ionicons name="call-outline" size={20} color="#007AFF" />
              <Text style={styles.infoLabel}>Support Phone</Text>
            </View>
            <Text style={styles.infoValue}>{apiConfig.support_phone}</Text>
          </View>
        )}
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Delivery App © {new Date().getFullYear()}
        </Text>
        <Text style={styles.footerSubtext}>
          Production-Ready Starter Template
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  section: {
    backgroundColor: '#fff',
    marginTop: 20,
    paddingHorizontal: 20,
    paddingVertical: 15,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  infoLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  infoLabel: {
    fontSize: 16,
    color: '#333',
  },
  infoValue: {
    fontSize: 16,
    color: '#666',
    fontWeight: '500',
  },
  statusCard: {
    backgroundColor: '#f9f9f9',
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
  },
  statusHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  statusLabel: {
    fontSize: 14,
    color: '#666',
  },
  statusIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#007AFF',
    borderRadius: 8,
  },
  actionButtonText: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '600',
  },
  featureRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  featureName: {
    fontSize: 15,
    color: '#333',
  },
  featureBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  featureBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  footer: {
    alignItems: 'center',
    paddingVertical: 30,
  },
  footerText: {
    fontSize: 14,
    color: '#999',
  },
  footerSubtext: {
    fontSize: 12,
    color: '#ccc',
    marginTop: 5,
  },
});
