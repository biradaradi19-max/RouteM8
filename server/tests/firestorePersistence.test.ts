import { describe, it, expect } from 'vitest';
import {
  toFirestoreFields,
  fromFirestoreFields,
} from '../services/firestorePersistence.js';

describe('Firestore Persistence Serialization', () => {
  it('converts JS object to Firestore field types', () => {
    const jsObj = {
      title: 'Lab Notebook',
      compensation: 22.5,
      pinAttempts: 0,
      active: true,
      coords: [37.4275, -122.1697],
      rejectedBy: ['user-1', 'user-2'],
      details: { itemSize: 'small' },
      createdAt: new Date('2026-10-23T12:00:00Z'),
    };

    const fields = toFirestoreFields(jsObj);
    expect(fields.title.stringValue).toBe('Lab Notebook');
    expect(fields.compensation.doubleValue).toBe(22.5);
    expect(fields.pinAttempts.integerValue).toBe('0');
    expect(fields.active.booleanValue).toBe(true);
    expect(fields.coords.arrayValue.values).toHaveLength(2);
    expect(fields.rejectedBy.arrayValue.values).toHaveLength(2);
    expect(fields.details.mapValue.fields.itemSize.stringValue).toBe('small');
    expect(fields.createdAt.timestampValue).toBe('2026-10-23T12:00:00.000Z');
  });

  it('converts Firestore fields back to JS object', () => {
    const firestoreDoc = {
      title: { stringValue: 'Lab Notebook' },
      compensation: { doubleValue: 22.5 },
      pinAttempts: { integerValue: '2' },
      active: { booleanValue: true },
      coords: {
        arrayValue: {
          values: [{ doubleValue: 37.4275 }, { doubleValue: -122.1697 }],
        },
      },
      rejectedBy: {
        arrayValue: {
          values: [{ stringValue: 'user-1' }],
        },
      },
      details: {
        mapValue: {
          fields: {
            itemSize: { stringValue: 'small' },
          },
        },
      },
      createdAt: { timestampValue: '2026-10-23T12:00:00.000Z' },
    };

    const parsed = fromFirestoreFields(firestoreDoc);
    expect(parsed.title).toBe('Lab Notebook');
    expect(parsed.compensation).toBe(22.5);
    expect(parsed.pinAttempts).toBe(2);
    expect(parsed.active).toBe(true);
    expect(parsed.coords).toEqual([37.4275, -122.1697]);
    expect(parsed.rejectedBy).toEqual(['user-1']);
    expect(parsed.details).toEqual({ itemSize: 'small' });
    expect(parsed.createdAt).toBeInstanceOf(Date);
  });
});
