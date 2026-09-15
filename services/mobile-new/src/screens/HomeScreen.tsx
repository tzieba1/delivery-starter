/**
 * HomeScreen.tsx - Order Creation Screen
 * 
 * Allows users to place new delivery orders
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { apiClient } from '../api/client';
import { OrderCreate } from '../types/api';

export default function HomeScreen() {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    customerName: '',
    customerPhone: '',
    pickupAddress: '',
    deliveryAddress: '',
    itemName: '',
    itemQuantity: '1',
    itemPrice: '',
  });

  const handleCreateOrder = async () => {
    // Validation
    if (!formData.customerName || !formData.customerPhone || 
        !formData.pickupAddress || !formData.deliveryAddress ||
        !formData.itemName || !formData.itemPrice) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    const order: OrderCreate = {
      customer_name: formData.customerName,
      customer_phone: formData.customerPhone,
      pickup_address: formData.pickupAddress,
      delivery_address: formData.deliveryAddress,
      items: [
        {
          name: formData.itemName,
          quantity: parseInt(formData.itemQuantity),
          price: parseFloat(formData.itemPrice),
          notes: null,
        },
      ],
      total_amount: parseFloat(formData.itemPrice) * parseInt(formData.itemQuantity),
    };

    setLoading(true);
    try {
      const response = await apiClient.post('/api/v1/orders', order);
      Alert.alert(
        'Success',
        `Order ${response.data.id} created successfully!`,
        [
          {
            text: 'OK',
            onPress: () => {
              // Reset form
              setFormData({
                customerName: '',
                customerPhone: '',
                pickupAddress: '',
                deliveryAddress: '',
                itemName: '',
                itemQuantity: '1',
                itemPrice: '',
              });
            },
          },
        ]
      );
    } catch (error: any) {
      console.error('Order creation failed:', error);
      Alert.alert(
        'Error',
        error.response?.data?.detail || 'Failed to create order'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.formContainer}>
        <Text style={styles.title}>New Delivery Order</Text>

        <Text style={styles.label}>Customer Name</Text>
        <TextInput
          style={styles.input}
          value={formData.customerName}
          onChangeText={(text) =>
            setFormData({ ...formData, customerName: text })
          }
          placeholder="John Doe"
        />

        <Text style={styles.label}>Phone Number</Text>
        <TextInput
          style={styles.input}
          value={formData.customerPhone}
          onChangeText={(text) =>
            setFormData({ ...formData, customerPhone: text })
          }
          placeholder="+1-555-0123"
          keyboardType="phone-pad"
        />

        <Text style={styles.label}>Pickup Address</Text>
        <TextInput
          style={styles.input}
          value={formData.pickupAddress}
          onChangeText={(text) =>
            setFormData({ ...formData, pickupAddress: text })
          }
          placeholder="Restaurant, 123 Main St"
        />

        <Text style={styles.label}>Delivery Address</Text>
        <TextInput
          style={styles.input}
          value={formData.deliveryAddress}
          onChangeText={(text) =>
            setFormData({ ...formData, deliveryAddress: text })
          }
          placeholder="456 Oak Ave, Apt 2B"
        />

        <View style={styles.divider} />

        <Text style={styles.sectionTitle}>Order Items</Text>

        <Text style={styles.label}>Item Name</Text>
        <TextInput
          style={styles.input}
          value={formData.itemName}
          onChangeText={(text) =>
            setFormData({ ...formData, itemName: text })
          }
          placeholder="Pizza, Burger, etc."
        />

        <View style={styles.row}>
          <View style={styles.halfWidth}>
            <Text style={styles.label}>Quantity</Text>
            <TextInput
              style={styles.input}
              value={formData.itemQuantity}
              onChangeText={(text) =>
                setFormData({ ...formData, itemQuantity: text })
              }
              placeholder="1"
              keyboardType="numeric"
            />
          </View>

          <View style={styles.halfWidth}>
            <Text style={styles.label}>Price</Text>
            <TextInput
              style={styles.input}
              value={formData.itemPrice}
              onChangeText={(text) =>
                setFormData({ ...formData, itemPrice: text })
              }
              placeholder="19.99"
              keyboardType="decimal-pad"
            />
          </View>
        </View>

        <View style={styles.totalContainer}>
          <Text style={styles.totalLabel}>Total:</Text>
          <Text style={styles.totalAmount}>
            $
            {(
              parseFloat(formData.itemPrice || '0') *
              parseInt(formData.itemQuantity || '1')
            ).toFixed(2)}
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleCreateOrder}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Place Order</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  formContainer: {
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    color: '#333',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 15,
    color: '#333',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 5,
    color: '#666',
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    marginBottom: 15,
    fontSize: 16,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  halfWidth: {
    width: '48%',
  },
  divider: {
    height: 1,
    backgroundColor: '#ddd',
    marginVertical: 20,
  },
  totalContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 8,
    marginBottom: 20,
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  totalAmount: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
