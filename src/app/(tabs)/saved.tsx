import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  SectionList,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AisleBadge } from '@/components/aisle-badge';
import { AvailabilityPill } from '@/components/availability-pill';
import { ProductTile } from '@/components/product-tile';
import { DemoDataBadge } from '@/components/demo-data-badge';
import { CenteredState } from '@/components/state-views';
import { ThemedText } from '@/components/themed-text';
import { useToast } from '@/components/toast';
import { MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { dataProvider } from '@/data';
import { storeCapabilities, type ProductDetails } from '@/data/types';
import { useTheme } from '@/hooks/use-theme';
import { locationSummary, priceLabel } from '@/lib/format';
import {
  addListProduct,
  addTextItem,
  getSavedProducts,
  removeSavedProduct,
  removeSavedProducts,
  setItemQuantity,
  type SavedProduct,
} from '@/lib/saved-products';
import { useSelectedStore } from '@/lib/selected-store';
import { buildShoppingSections, parseListText } from '@/lib/shopping-list';
import { PrimaryButton } from '@/components/primary-button';

/**
 * Saved products as a shopping list: resolved live against the selected
 * store (the same item legitimately shows a different aisle — or "not
 * carried" — after a store switch), grouped by aisle so the list walks the
 * store in order, with tap-to-check-off. Checked state is per-visit;
 * grouping re-resolves automatically when the store changes.
 */
export default function SavedScreen() {
  const router = useRouter();
  const theme = useTheme();
  const toast = useToast();
  const { store, isHydrating } = useSelectedStore();
  const [saved, setSaved] = useState<SavedProduct[] | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());

  useFocusEffect(
    useCallback(() => {
      getSavedProducts().then(setSaved);
    }, [])
  );

  // Different store: previous check-offs no longer apply. Guarded
  // adjust-during-render pattern (see search.tsx) instead of an effect.
  const [checkedStoreId, setCheckedStoreId] = useState(store?.id);
  if (store?.id !== checkedStoreId) {
    setCheckedStoreId(store?.id);
    setChecked(new Set());
  }

  const toggleChecked = (id: string) => {
    setChecked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const [addText, setAddText] = useState('');
  const [pasteVisible, setPasteVisible] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [resolving, setResolving] = useState(false);

  /**
   * Smart add: try to resolve the words against the selected store's
   * catalog; a confident top hit becomes a product entry (with its aisle),
   * anything else stays a free-text item under "Unknown location".
   */
  const addSmartItem = async (name: string, quantity = 1): Promise<'product' | 'text'> => {
    const trimmed = name.trim();
    if (!trimmed || !store) return 'text';
    try {
      const hits = await dataProvider.searchProducts(store.id, trimmed);
      const top = hits[0];
      if (top) {
        let list = await addListProduct({
          id: top.id,
          name: top.name,
          brand: top.brand,
          sizeText: top.sizeText,
          imageUrl: top.imageUrl,
        });
        if (quantity > 1) list = await setItemQuantity(top.id, quantity);
        setSaved(list);
        return 'product';
      }
    } catch {
      // resolution failure → fall through to text item
    }
    const list = await addTextItem(quantity > 1 ? `${quantity}x ${trimmed}` : trimmed);
    setSaved(list);
    return 'text';
  };

  const handleAddSubmit = async () => {
    const value = addText.trim();
    if (!value) return;
    setAddText('');
    setResolving(true);
    const kind = await addSmartItem(value);
    setResolving(false);
    toast.show(kind === 'product' ? 'Added with aisle info' : 'Added to your list');
  };

  const handlePasteImport = async () => {
    const entries = parseListText(pasteText);
    if (entries.length === 0) return;
    setPasteVisible(false);
    setPasteText('');
    setResolving(true);
    let matched = 0;
    for (const entry of entries) {
      const kind = await addSmartItem(entry.name, entry.quantity);
      if (kind === 'product') matched += 1;
    }
    setResolving(false);
    toast.show(`Added ${entries.length} items · ${matched} matched with locations`);
  };

  const handleClearCompleted = async () => {
    if (checked.size === 0) return;
    const list = await removeSavedProducts([...checked]);
    setSaved(list);
    setChecked(new Set());
    toast.show('Cleared completed items');
  };

  const changeQuantity = async (item: SavedProduct, delta: number) => {
    const list = await setItemQuantity(item.id, (item.quantity ?? 1) + delta);
    setSaved(list);
  };

  const storeId = store?.id;
  const ids = (saved ?? []).map((item) => item.id);
  // Free-text items have no catalog product to resolve.
  const resolveIds = (saved ?? [])
    .filter((item) => !item.isTextItem)
    .map((item) => item.id);
  const resolveQuery = useQuery({
    queryKey: ['saved-resolve', storeId, resolveIds.join(',')],
    enabled: Boolean(storeId) && resolveIds.length > 0,
    queryFn: async () => {
      const results = await Promise.all(
        resolveIds.map((id) => dataProvider.getProduct(storeId as string, id))
      );
      return new Map<string, ProductDetails | null>(
        resolveIds.map((id, index) => [id, results[index]])
      );
    },
  });

  const aisleDataSupported = store
    ? storeCapabilities(store).aisleData
    : false;
  const sections = useMemo(
    () => buildShoppingSections(saved ?? [], resolveQuery.data, aisleDataSupported),
    [saved, resolveQuery.data, aisleDataSupported]
  );

  if (isHydrating) {
    return null;
  }
  if (!store) {
    return <Redirect href="/" />;
  }

  const capabilities = storeCapabilities(store);

  const remove = async (item: SavedProduct) => {
    const list = await removeSavedProduct(item.id);
    setSaved(list);
    toast.show('Removed from Saved');
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <ThemedText type="title" accessibilityRole="header">
              Shopping list
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {store.name}
              {checked.size > 0 ? ` · ${checked.size} of ${ids.length} done` : ''}
            </ThemedText>
          </View>
          {checked.size > 0 ? (
            <Pressable
              onPress={handleClearCompleted}
              accessibilityRole="button"
              accessibilityLabel="Remove all checked-off items from the list"
              hitSlop={8}
              style={styles.clearButton}
            >
              <ThemedText type="smallBold" style={{ color: theme.tint }}>
                Clear done
              </ThemedText>
            </Pressable>
          ) : null}
        </View>
        <DemoDataBadge />
        <View style={[styles.addRow, { backgroundColor: theme.backgroundElement }]}>
          <Ionicons name="add" size={20} color={theme.textSecondary} />
          <TextInput
            value={addText}
            onChangeText={setAddText}
            onSubmitEditing={handleAddSubmit}
            placeholder={resolving ? 'Finding aisles…' : 'Add an item, e.g. milk'}
            placeholderTextColor={theme.textSecondary}
            editable={!resolving}
            returnKeyType="done"
            accessibilityLabel="Add an item to your shopping list"
            style={[styles.addInput, { color: theme.text }]}
          />
          <Pressable
            onPress={() => setPasteVisible(true)}
            accessibilityRole="button"
            accessibilityLabel="Paste a whole shopping list"
            hitSlop={8}
            style={styles.pasteButton}
          >
            <Ionicons name="clipboard-outline" size={18} color={theme.tint} />
          </Pressable>
        </View>
      </View>

      <Modal
        visible={pasteVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPasteVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: theme.background }]}>
            <ThemedText type="subtitle" accessibilityRole="header">
              Paste your shopping list
            </ThemedText>
            <ThemedText type="caption" themeColor="textSecondary">
              One item per line. Fetch matches each one to {store.name} and fills in
              the aisles it can verify.
            </ThemedText>
            <TextInput
              value={pasteText}
              onChangeText={setPasteText}
              multiline
              numberOfLines={6}
              placeholder={'milk\neggs\nbread\n2x paper towels'}
              placeholderTextColor={theme.textSecondary}
              accessibilityLabel="Shopping list text, one item per line"
              style={[
                styles.pasteInput,
                { color: theme.text, backgroundColor: theme.backgroundElement },
              ]}
            />
            <PrimaryButton label="Add items" onPress={handlePasteImport} />
            <PrimaryButton
              label="Cancel"
              variant="secondary"
              onPress={() => setPasteVisible(false)}
            />
          </View>
        </View>
      </Modal>

      {saved === null ? null : saved.length === 0 ? (
        <CenteredState
          icon="bookmark-outline"
          title="Nothing saved yet"
          body="Tap Save on any product to build a shopping list with today's aisle and availability."
          actionLabel="Search products"
          onAction={() => router.push('/search')}
        />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) =>
            section.title ? (
              <ThemedText
                type="caption"
                themeColor="textSecondary"
                style={styles.sectionTitle}
                accessibilityRole="header"
              >
                {section.title}
              </ThemedText>
            ) : null
          }
          renderItem={({ item }) => {
            const resolved = resolveQuery.data?.get(item.id);
            const isChecked = checked.has(item.id);
            const subtitle = [item.brand, item.sizeText].filter(Boolean).join(' · ');
            const price =
              capabilities.pricing && resolved ? priceLabel(resolved.priceCents) : null;
            return (
              <View
                style={[
                  styles.card,
                  { backgroundColor: theme.backgroundElement },
                  isChecked && styles.rowChecked,
                ]}
              >
                <View style={styles.row}>
                <Pressable
                  onPress={() => toggleChecked(item.id)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: isChecked }}
                  accessibilityLabel={
                    isChecked
                      ? `${item.name}: done. Uncheck to put it back on the list.`
                      : `${item.name}: mark as picked up.`
                  }
                  hitSlop={6}
                  style={styles.checkButton}
                >
                  <Ionicons
                    name={isChecked ? 'checkmark-circle' : 'ellipse-outline'}
                    size={24}
                    color={isChecked ? theme.tint : theme.textSecondary}
                  />
                </Pressable>
                {item.imageUrl ? (
                  <ProductTile name={item.name} brand={item.brand} imageUrl={item.imageUrl} size={40} />
                ) : null}
                <Pressable
                  onPress={() =>
                    item.isTextItem
                      ? toggleChecked(item.id)
                      : router.push({ pathname: '/product/[id]', params: { id: item.id } })
                  }
                  accessibilityRole="button"
                  accessibilityLabel={
                    item.isTextItem
                      ? `${item.name}. Free-text list item.`
                      : `${item.name}. Open product details.`
                  }
                  style={styles.rowBody}
                >
                  <ThemedText
                    type="smallBold"
                    numberOfLines={2}
                    style={[styles.rowName, isChecked && styles.rowNameChecked]}
                  >
                    {(item.quantity ?? 1) > 1 ? `${item.quantity} × ` : ''}
                    {item.name}
                  </ThemedText>
                  {subtitle ? (
                    <ThemedText type="caption" themeColor="textSecondary">
                      {subtitle}
                    </ThemedText>
                  ) : null}
                  {item.isTextItem ? (
                    <ThemedText type="caption" themeColor="textSecondary">
                      Not matched to a product yet
                    </ThemedText>
                  ) : resolveQuery.isPending && ids.length > 0 ? (
                    <ThemedText type="caption" themeColor="textSecondary">
                      Checking this store…
                    </ThemedText>
                  ) : resolved === null ? (
                    <ThemedText type="caption" themeColor="textSecondary">
                      Not carried at {store.name}
                    </ThemedText>
                  ) : resolved ? (
                    <>
                      <ThemedText type="caption" themeColor="textSecondary">
                        {[locationSummary(resolved.location), price]
                          .filter(Boolean)
                          .join(' · ')}
                      </ThemedText>
                      {capabilities.inventory && !isChecked ? (
                        <AvailabilityPill availability={resolved.availability} />
                      ) : null}
                    </>
                  ) : null}
                </Pressable>
                {capabilities.aisleData && resolved ? (
                  <AisleBadge aisle={resolved.location?.aisle} />
                ) : null}
                </View>

                {!isChecked ? (
                  <View style={styles.rowFooter}>
                    <View style={styles.quantityRow}>
                      <Pressable
                        onPress={() => changeQuantity(item, -1)}
                        accessibilityRole="button"
                        accessibilityLabel={`Decrease quantity of ${item.name}`}
                        hitSlop={8}
                        style={[styles.quantityButton, { backgroundColor: theme.backgroundSelected }]}
                      >
                        <Ionicons name="remove" size={14} color={theme.text} />
                      </Pressable>
                      <ThemedText type="caption" themeColor="textSecondary" style={styles.quantityValue}>
                        {item.quantity ?? 1}
                      </ThemedText>
                      <Pressable
                        onPress={() => changeQuantity(item, 1)}
                        accessibilityRole="button"
                        accessibilityLabel={`Increase quantity of ${item.name}`}
                        hitSlop={8}
                        style={[styles.quantityButton, { backgroundColor: theme.backgroundSelected }]}
                      >
                        <Ionicons name="add" size={14} color={theme.text} />
                      </Pressable>
                    </View>
                    <Pressable
                      onPress={() => remove(item)}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${item.name} from your list`}
                      hitSlop={6}
                      style={styles.removeButton}
                    >
                      <Ionicons name="trash-outline" size={16} color={theme.textSecondary} />
                    </Pressable>
                  </View>
                ) : null}
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  header: {
    padding: Spacing.four,
    paddingBottom: Spacing.three,
    gap: Spacing.two,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  headerText: {
    flex: 1,
    gap: Spacing.one,
  },
  clearButton: {
    minHeight: MinTouchTarget - 12,
    justifyContent: 'center',
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.lg,
    minHeight: 48,
  },
  addInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: Spacing.two,
  },
  pasteButton: {
    minWidth: MinTouchTarget - 12,
    minHeight: MinTouchTarget - 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  modalCard: {
    borderRadius: Radius.lg,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  pasteInput: {
    minHeight: 130,
    borderRadius: Radius.md,
    padding: Spacing.three,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  quantityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  quantityValue: {
    minWidth: 16,
    textAlign: 'center',
  },
  quantityButton: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.five,
    gap: Spacing.two + Spacing.half,
  },
  sectionTitle: {
    marginTop: Spacing.two,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  card: {
    padding: Spacing.three,
    borderRadius: Radius.lg,
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + Spacing.half,
  },
  rowFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowChecked: {
    opacity: 0.55,
  },
  rowBody: {
    flex: 1,
    gap: Spacing.one,
  },
  rowName: {
    fontSize: 16,
    lineHeight: 21,
  },
  rowNameChecked: {
    textDecorationLine: 'line-through',
  },
  checkButton: {
    minWidth: MinTouchTarget - 12,
    minHeight: MinTouchTarget - 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeButton: {
    minWidth: MinTouchTarget - 8,
    minHeight: MinTouchTarget - 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
