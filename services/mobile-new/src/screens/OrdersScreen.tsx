/**
 * OrdersScreen.tsx - Order List and Detail Navigation
 * 
 * Displays user's order history with status indicators
 * Tapping an order navigates to detail screen
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { apiClient } from '../api/client';
import { OrderResponse } from '../types/api';

export default function OrdersScreen() {
  const [orders, setOrders] = useState<OrderResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<OrderResponse | null>(null);

  const fetchOrders = async () => {
    try {
      const response = await apiClient.get('/api/v1/orders');
      setOrders(response.data);
    } catch (error: any) {
      console.error('Failed to fetch orders:', error);
      Alert.alert('Error', 'Failed to load orders');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchOrders();
  }, []);

  const handleOrderPress = async (orderId: string) => {
    try {
      const response = await apiClient.get(`/api/v1/orders/${orderId}`);
      setSelectedOrder(response.data);
    } catch (error) {
      Alert.alert('Error', 'Failed to load order details');
    }
  };

  const handleCancelOrder = async (orderId: string) => {
    Alert.alert(
      'Cancel Order',
      'Are you sure you want to cancel this order?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiClient.delete(`/api/v1/orders/${orderId}`);
              fetchOrders(); // Refresh list
              setSelectedOrder(null);
            } catch (error: any) {
              Alert.alert(
                'Error',
                error.response?.data?.detail || 'Failed to cancel order'
              );
            }
          },
        },
      ]
    );
  };

  const getStatusColor = (status: string): string => {
    const colors: Record<string, string> = {
      pending: '#FFA500',
      confirmed: '#4169E1',
      picked_up: '#9370DB',
      in_transit: '#32CD32',
      delivered: '#228B22',
      cancelled: '#DC143C',
    };
    return colors[status] || '#808080';
  };

  const renderOrderItem = ({ item }: { item: OrderResponse }) => (
    <TouchableOpacity
      style={styles.orderCard}
      onPress={() => handleOrderPress(item.id)}
    >
      <View style={styles.orderHeader}>
        <Text style={styles.orderId}>{item.id}</Text>
        <View
          style={[
            styles.statusBadge,
            { backgroundColor: getStatusColor(item.status) },
          ]}
        >
          <Text style={styles.statusText}>{item.status_display}</Text>
        </View>
      </View>

      <View style={styles.orderDetails}>
        <View style={styles.addressRow}>
          <Ionicons name="location-outline" size={16} color="#666" />
          <Text style={[styles.addressText, { marginLeft: 5 }]} numberOfLines={1}>
            {item.delivery_address}
          </Text>
        </View>

        <View style={styles.orderFooter}>
          <Text style={styles.itemCount}>
            {item.items.length} item{item.items.length > 1 ? 's' : ''}
          </Text>
          <Text style={styles.totalAmount}>${item.total_amount.toFixed(2)}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderOrderDetail = () => {
    if (!selectedOrder) return null;

    return (
      <View style={styles.detailOverlay}>
        <View style={styles.detailContainer}>
          <View style={styles.detailHeader}>
            <Text style={styles.detailTitle}>Order Details</Text>
            <TouchableOpacity onPress={() => setSelectedOrder(null)}>
              <Ionicons name="close" size={24} color="#333" />
            </TouchableOpacity>
          </View>

          <View style={styles.detailContent}>
            <View style={styles.detailSection}>
              <Text style={styles.detailLabel}>Order ID</Text>
              <Text style={styles.detailValue}>{selectedOrder.id}</Text>
            </View>

            <View style={styles.detailSection}>
              <Text style={styles.detailLabel}>Status</Text>
              <View
                style={[
                  styles.statusBadge,
                  { backgroundColor: getStatusColor(selectedOrder.status) },
                ]}
              >
                <Text style={styles.statusText}>
                  {selectedOrder.status_display}
                </Text>
              </View>
            </View>

            <View style={styles.detailSection}>
              <Text style={styles.detailLabel}>Customer</Text>
              <Text style={styles.detailValue}>{selectedOrder.customer_name}</Text>
              <Text style={styles.detailSubvalue}>{selectedOrder.customer_phone}</Text>
            </View>

            <View style={styles.detailSection}>
              <Text style={styles.detailLabel}>Pickup</Text>
              <Text style={styles.detailValue}>{selectedOrder.pickup_address}</Text>
            </View>

            <View style={styles.detailSection}>
              <Text style={styles.detailLabel}>Delivery</Text>
              <Text style={styles.detailValue}>{selectedOrder.delivery_address}</Text>
            </View>

            <View style={styles.detailSection}>
              <Text style={styles.detailLabel}>Items</Text>
              {selectedOrder.items.map((item, index) => (
                <View key={index} style={styles.itemRow}>
                  <Text style={styles.itemName}>
                    {item.quantity}x {item.name}
                  </Text>
                  <Text style={styles.itemPrice}>${item.price.toFixed(2)}</Text>
                </View>
              ))}
            </View>

            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>
                ${selectedOrder.total_amount.toFixed(2)}
              </Text>
            </View>

            {selectedOrder.can_cancel && (
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => handleCancelOrder(selectedOrder.id)}
              >
                <Text style={styles.cancelButtonText}>Cancel Order</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={orders}
        renderItem={renderOrderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="receipt-outline" size={64} color="#ccc" />
            <Text style={styles.emptyText}>No orders yet</Text>
            <Text style={styles.emptySubtext}>
              Create your first order from the Home tab
            </Text>
          </View>
        }
      />
      {renderOrderDetail()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContainer: {
    padding: 15,
  },
  orderCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 15,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  orderId: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  orderDetails: {
    paddingVertical: 4,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  addressText: {
    flex: 1,
    fontSize: 14,
    color: '#666',
  },
  orderFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  itemCount: {
    fontSize: 14,
    color: '#999',
  },
  totalAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#999',
    marginTop: 15,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#ccc',
    marginTop: 5,
  },
  detailOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  detailContainer: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
  },
  detailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  detailTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  detailContent: {
    padding: 20,
  },
  detailSection: {
    marginBottom: 20,
  },
  detailLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#999',
    marginBottom: 5,
  },
  detailValue: {
    fontSize: 16,
    color: '#333',
  },
  detailSubvalue: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  itemName: {
    fontSize: 15,
    color: '#333',
  },
  itemPrice: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    marginTop: 10,
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  totalValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  cancelButton: {
    backgroundColor: '#DC143C',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 20,
  },
  cancelButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
