import type {
  DeletedObject,
  ObjectMetadata,
  PutObjectInput,
  StoragePort,
  StorageResult,
  StoredObject,
} from "./index.ts";

export type StorageOperation = Readonly<{
  operation: "put" | "get" | "delete";
  key: string;
}>;

export type RecordingStoragePortOptions = Readonly<{
  now?: (() => string) | undefined;
}>;

export interface RecordingStoragePort extends StoragePort {
  getOperations(): readonly StorageOperation[];
}

const ByteArray = Uint8Array;
const apply = Reflect.apply;
const typedArrayPrototype = Object.getPrototypeOf(ByteArray.prototype);
// biome-ignore lint/style/noNonNullAssertion: ECMAScript defines %TypedArray%.prototype.byteLength as an accessor property.
const byteLengthGetter = Object.getOwnPropertyDescriptor(
  typedArrayPrototype,
  "byteLength"
)!.get!;
const typedArraySet = ByteArray.prototype.set;

const copyBytes = (source: Uint8Array): Uint8Array => {
  const copy = new ByteArray(apply(byteLengthGetter, source, []));
  apply(typedArraySet, copy, [source]);
  return copy;
};

const copyMetadata = (metadata: ObjectMetadata): ObjectMetadata => {
  return Object.freeze({ ...metadata });
};

const copyStoredObject = (object: StoredObject): StoredObject => ({
  metadata: copyMetadata(object.metadata),
  body: copyBytes(object.body),
});

export const createRecordingStoragePort = (
  options: RecordingStoragePortOptions = {}
): RecordingStoragePort => {
  const now = options.now ?? (() => "1970-01-01T00:00:00.000Z");
  const objects = new Map<string, StoredObject>();
  const operations: StorageOperation[] = [];

  const record = (
    operation: StorageOperation["operation"],
    key: string
  ): void => {
    operations.push(Object.freeze({ operation, key }));
  };

  const put = (
    input: PutObjectInput
  ): Promise<StorageResult<ObjectMetadata>> => {
    const key = input.key;
    const body = input.body;
    const contentType = input.contentType;
    const checksum = input.checksum;
    record("put", key);
    const previous = objects.get(key);
    const timestamp = now();
    const metadata = Object.freeze({
      key,
      size: apply(byteLengthGetter, body, []),
      ...(contentType === undefined ? {} : { contentType }),
      ...(checksum === undefined ? {} : { checksum }),
      createdAt: previous?.metadata.createdAt ?? timestamp,
      updatedAt: timestamp,
    });
    objects.set(key, {
      metadata,
      body: copyBytes(body),
    });

    return Promise.resolve({ status: "ok", value: copyMetadata(metadata) });
  };

  const get = (key: string): Promise<StorageResult<StoredObject>> => {
    record("get", key);
    const object = objects.get(key);
    if (!object) return Promise.resolve({ status: "not-found" });

    return Promise.resolve({ status: "ok", value: copyStoredObject(object) });
  };

  const remove = (key: string): Promise<StorageResult<DeletedObject>> => {
    record("delete", key);
    if (!objects.delete(key)) return Promise.resolve({ status: "not-found" });

    return Promise.resolve({ status: "ok", value: { deleted: true } });
  };

  const getOperations = (): readonly StorageOperation[] => {
    return Object.freeze(
      operations.map((operation) => Object.freeze({ ...operation }))
    );
  };

  return Object.freeze({ put, get, delete: remove, getOperations });
};
