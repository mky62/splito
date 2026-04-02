import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { X, Plus, Receipt } from 'lucide-react-native';

interface BillItem {
  id: string;
  name: string;
  price: number;
  type?: string;
}

interface ItemEditorProps {
  items: BillItem[];
  billTotal: number | null;
  updateItem: (id: string, field: 'name' | 'price', value: string) => void;
  addItem: () => void;
  deleteItem: (id: string) => void;
}

export const ItemEditor: React.FC<ItemEditorProps> = ({ items, billTotal, updateItem, addItem, deleteItem }) => {
  const calculatedTotal = items.reduce((sum, item) => sum + item.price, 0);

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleRow}>
          <View style={styles.cardIconBg}>
            <Receipt size={18} color="#6366F1" />
          </View>
          <Text style={styles.cardTitle}>Items</Text>
        </View>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{items.length}</Text>
        </View>
      </View>

      <View style={styles.itemsList}>
        {items.map((item, index) => (
          <View key={item.id} style={[styles.itemRow, index !== items.length - 1 && styles.itemRowBorder]}>
            <View style={styles.itemInfo}>
              <TextInput
                style={styles.itemNameInput}
                value={item.name}
                onChangeText={text => updateItem(item.id, 'name', text)}
                placeholder="Item name"
                placeholderTextColor="#9CA3AF"
              />
              <TextInput
                style={styles.itemPriceInput}
                value={item.price.toString()}
                onChangeText={text => updateItem(item.id, 'price', text)}
                placeholder="0.00"
                placeholderTextColor="#9CA3AF"
                keyboardType="numeric"
              />
            </View>
            <TouchableOpacity onPress={() => deleteItem(item.id)} style={styles.deleteBtn}>
              <X size={18} color="#EF4444" />
            </TouchableOpacity>
          </View>
        ))}
      </View>

      <TouchableOpacity onPress={addItem} style={styles.addBtn} activeOpacity={0.7}>
        <Plus size={18} color="#6366F1" />
        <Text style={styles.addBtnText}>Add Item</Text>
      </TouchableOpacity>

      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>Total</Text>
        <Text style={styles.totalValue}>{(billTotal || calculatedTotal).toFixed(2)}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cardIconBg: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 17,
    fontFamily: 'Saira_600SemiBold',
    color: '#0F172A',
  },
  badge: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  badgeText: {
    fontSize: 13,
    fontFamily: 'Saira_600SemiBold',
    color: '#6366F1',
  },
  itemsList: {
    marginBottom: 12,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  itemRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  itemInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  itemNameInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Saira_500Medium',
    color: '#0F172A',
    paddingVertical: 8,
  },
  itemPriceInput: {
    width: 70,
    fontSize: 15,
    fontFamily: 'Saira_600SemiBold',
    color: '#0F172A',
    textAlign: 'right',
    paddingVertical: 8,
  },
  deleteBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FEF2F2',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 10,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#EEF2FF',
    gap: 6,
    marginBottom: 16,
  },
  addBtnText: {
    fontSize: 14,
    fontFamily: 'Saira_600SemiBold',
    color: '#6366F1',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 14,
    borderTopWidth: 2,
    borderTopColor: '#0F172A',
  },
  totalLabel: {
    fontSize: 16,
    fontFamily: 'Saira_600SemiBold',
    color: '#475569',
  },
  totalValue: {
    fontSize: 20,
    fontFamily: 'Saira_700Bold',
    color: '#0F172A',
  },
});
