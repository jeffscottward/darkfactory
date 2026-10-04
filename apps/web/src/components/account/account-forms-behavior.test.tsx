import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const formRuntime = vi.hoisted(() => {
  type ElementRecord = Readonly<{ props: Record<string, unknown> }>;
  type ValidatorContext = Readonly<{
    value: unknown;
    fieldApi: Readonly<{
      form: Readonly<{ getFieldValue: (name: string) => unknown }>;
    }>;
  }>;
  type Validator = (context: ValidatorContext) => unknown;
  type Validators = Readonly<{
    onBlur?: Validator;
    onSubmit?: Validator;
  }>;
  type FormConfig = Readonly<{
    defaultValues: Record<string, unknown>;
    onSubmit: (
      context: Readonly<{ value: Record<string, unknown> }>
    ) => Promise<unknown> | unknown;
  }>;

  let config: FormConfig | undefined;
  let initialValues: Record<string, unknown> = {};
  let values: Record<string, unknown> = {};
  let errors: Record<string, unknown> = {};
  let validators: Record<string, Validators | undefined> = {};
  let controls = new Map<string, ElementRecord>();
  let buttons = new Map<string, ElementRecord>();
  let isSubmitting = false;

  const textOf = (node: unknown): string => {
    if (typeof node === "string" || typeof node === "number")
      return String(node);
    if (Array.isArray(node)) return node.map(textOf).join("");
    if (typeof node !== "object" || node === null) return "";
    const props = Reflect.get(node, "props");
    if (typeof props !== "object" || props === null) return "";
    return textOf(Reflect.get(props, "children"));
  };

  const capture = (node: unknown, seen = new WeakSet<object>()): void => {
    if (Array.isArray(node)) {
      for (const child of node) {
        capture(child, seen);
      }
      return;
    }
    if (typeof node !== "object" || node === null || seen.has(node)) return;
    seen.add(node);
    const props = Reflect.get(node, "props");
    if (typeof props !== "object" || props === null) return;
    const element = node as ElementRecord;
    if (typeof element.props["id"] === "string")
      controls.set(element.props["id"], element);
    if (
      element.props["type"] === "submit" ||
      typeof element.props["onClick"] === "function"
    ) {
      const label = textOf(element).replace(/\s+/gu, " ").trim();
      if (label.length > 0) buttons.set(label, element);
    }
    for (const value of Object.values(element.props)) capture(value, seen);
  };

  const validatorContext = (name: string): ValidatorContext => ({
    fieldApi: {
      form: { getFieldValue: (fieldName) => values[fieldName] },
    },
    value: values[name],
  });

  const validate = (name: string, trigger: "onBlur" | "onSubmit"): void => {
    const validator = validators[name]?.[trigger];
    const error = validator?.(validatorContext(name));
    if (error === undefined) {
      delete errors[name];
    } else errors[name] = error;
  };

  const Field = (
    props: Readonly<{
      children: (
        field: Readonly<{
          handleBlur: () => void;
          handleChange: (value: unknown) => void;
          name: string;
          state: Readonly<{
            meta: Readonly<{ errors: readonly unknown[] }>;
            value: unknown;
          }>;
        }>
      ) => unknown;
      name: string;
      validators?: Validators;
    }>
  ) => {
    validators[props.name] = props.validators;
    const tree = props.children({
      handleBlur: () => validate(props.name, "onBlur"),
      handleChange: (value) => {
        values[props.name] = value;
        return delete errors[props.name];
      },
      name: props.name,
      state: {
        meta: {
          errors: errors[props.name] === undefined ? [] : [errors[props.name]],
        },
        value: values[props.name],
      },
    });
    capture(tree);
    return tree;
  };

  const Subscribe = (
    props: Readonly<{
      children: (selection: unknown) => unknown;
      selector: (
        state: Readonly<{
          canSubmit: boolean;
          isDirty: boolean;
          isSubmitting: boolean;
        }>
      ) => unknown;
    }>
  ) => {
    const isDirty = Object.keys(values).some(
      (name) => !Object.is(values[name], initialValues[name])
    );
    const canSubmit = Object.values(errors).every(
      (error) => error === undefined
    );
    const tree = props.children(
      props.selector({ canSubmit, isDirty, isSubmitting })
    );
    capture(tree);
    return tree;
  };

  const submit = async (): Promise<void> => {
    if (config === undefined)
      throw new Error("Render a form before submitting it.");
    for (const name of Object.keys(validators)) validate(name, "onSubmit");
    if (Object.values(errors).some((error) => error !== undefined)) return;
    isSubmitting = true;
    try {
      await config.onSubmit({ value: { ...values } });
    } finally {
      isSubmitting = false;
    }
  };

  return {
    blur: (id: string): void => {
      const onBlur = controls.get(id)?.props["onBlur"];
      if (typeof onBlur !== "function")
        throw new Error(`Expected #${id} to support blur.`);
      (onBlur as () => void)();
    },
    button: (label: string): ElementRecord => {
      const button = buttons.get(label);
      if (button === undefined)
        throw new Error(`Expected button named ${label}.`);
      return button;
    },
    changeChecked: (id: string, checked: boolean): void => {
      const onChange = controls.get(id)?.props["onChange"];
      if (typeof onChange !== "function")
        throw new Error(`Expected #${id} to accept checked state.`);
      (
        onChange as (
          event: Readonly<{ target: Readonly<{ checked: boolean }> }>
        ) => void
      )({ target: { checked } });
    },
    changeText: (id: string, value: string): void => {
      const onChange = controls.get(id)?.props["onChange"];
      if (typeof onChange !== "function")
        throw new Error(`Expected #${id} to accept text.`);
      (
        onChange as (
          event: Readonly<{ target: Readonly<{ value: string }> }>
        ) => void
      )({ target: { value } });
    },
    click: (label: string): void => {
      const onClick = buttons.get(label)?.props["onClick"];
      if (typeof onClick !== "function")
        throw new Error(`Expected button named ${label}.`);
      (onClick as () => void)();
    },
    control: (id: string): ElementRecord => {
      const control = controls.get(id);
      if (control === undefined) throw new Error(`Expected control #${id}.`);
      return control;
    },
    reset: (): void => {
      config = undefined;
      initialValues = {};
      values = {};
      errors = {};
      validators = {};
      controls = new Map();
      buttons = new Map();
      isSubmitting = false;
    },
    submit,
    useForm: (nextConfig: FormConfig) => {
      if (config === undefined) {
        initialValues = { ...nextConfig.defaultValues };
        values = { ...nextConfig.defaultValues };
      }
      config = nextConfig;
      controls.clear();
      buttons.clear();
      return { Field, handleSubmit: submit, Subscribe };
    },
  };
});

vi.mock("@tanstack/react-form", () => ({ useForm: formRuntime.useForm }));

import { AddressForm } from "./address-form.tsx";
import { PreferencesForm } from "./preferences-form.tsx";
import { ProfileForm } from "./profile-form.tsx";
import { PasswordForm } from "./security-panel.tsx";

const updatedAt = new Date("2026-01-02T00:00:00.000Z");
const address = {
  city: "Example City",
  country: "US",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  id: "address-1",
  isPrimary: true,
  line1: "100 Example Avenue",
  line2: "Suite 200",
  postalCode: "20001",
  region: "DC",
  type: "work" as const,
  updatedAt,
};
const profile = {
  avatarUrl: "https://placehold.co/96x96",
  biography: "Maintains an owner-visible example profile.",
  businessName: "Alice & Co.",
  dateOfBirth: "1990-01-02",
  displayName: "Alice A.",
  firstName: "Alice",
  jobTitle: "Builder",
  lastName: "Adams",
  locale: "en-US",
  phone: "+1 202-555-0100",
  timezone: "America/New_York",
  updatedAt,
};
const preferences = {
  analyticsConsent: false,
  density: "default" as const,
  emailNotifications: true,
  fontSize: "default" as const,
  personalizationConsent: true,
  productUpdates: false,
  profileVisibility: "private" as const,
  radius: "small" as const,
  theme: "system" as const,
  updatedAt,
};

const deferred = <Value,>() => {
  let resolvePromise = (_value: Value): void => {
    throw new Error("Deferred promise was not initialized.");
  };
  const promise = new Promise<Value>((resolve) => {
    return (resolvePromise = resolve);
  });
  return { promise, resolve: resolvePromise };
};

type NativeSubmitEvent = Readonly<{
  preventDefault: () => void;
  stopPropagation: () => void;
}>;

const invokeNativeSubmit = (tree: unknown) => {
  const props = Reflect.get(tree as object, "props");
  if (typeof props !== "object" || props === null)
    throw new Error("Expected a form element.");
  const onSubmit = Reflect.get(props, "onSubmit");
  if (typeof onSubmit !== "function")
    throw new Error("Expected a native submit handler.");
  const event = {
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  };
  (onSubmit as (event: NativeSubmitEvent) => void)(event);
  return event;
};

const flushMicrotasks = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

afterEach(() => {
  formRuntime.reset();
  return vi.unstubAllGlobals();
});

describe("address form behavior", () => {
  it("announces required and maximum-boundary errors, while accepting an empty optional line", async () => {
    const onSave = vi.fn();
    const render = () =>
      renderToStaticMarkup(<AddressForm onCancel={vi.fn()} onSave={onSave} />);

    let html = render();
    expect(formRuntime.button("Create address").props["disabled"]).toBe(true);
    expect(formRuntime.control("line1").props["maxLength"]).toBe(200);
    expect(formRuntime.control("country").props["maxLength"]).toBe(2);

    await formRuntime.submit();
    html = render();
    for (const message of [
      "Address line 1 is required.",
      "City is required.",
      "State or region is required.",
      "Postal code is required.",
      "Country code is required.",
    ])
      expect(html).toContain(message);
    expect(html).not.toContain("Address line 2 is required.");
    expect(formRuntime.control("line1").props["aria-invalid"]).toBe(true);
    expect(onSave).not.toHaveBeenCalled();

    formRuntime.changeText("line1", "x".repeat(201));
    formRuntime.blur("line1");
    html = render();
    expect(html).toContain("Address line 1 must be 200 characters or fewer.");

    formRuntime.changeText("line1", "x".repeat(200));
    formRuntime.blur("line1");
    formRuntime.changeText("line2", "   ");
    formRuntime.blur("line2");
    html = render();
    expect(html).not.toContain("Address line 1 must be");
    expect(html).toContain("Address line 2 is required.");

    formRuntime.changeText("line2", "");
    formRuntime.blur("line2");
    html = render();
    return expect(html).not.toContain("Address line 2 is required.");
  });

  it("normalizes a new address, forwards cancellation, and permits the exact country boundary", async () => {
    const onCancel = vi.fn();
    const onSave = vi.fn();
    const render = () =>
      renderToStaticMarkup(<AddressForm onCancel={onCancel} onSave={onSave} />);

    render();
    formRuntime.changeText("type", "work");
    formRuntime.changeText("line1", "  100 Example Avenue  ");
    formRuntime.changeText("line2", "  Suite 200  ");
    formRuntime.changeText("city", "  Example City  ");
    formRuntime.changeText("region", "  DC  ");
    formRuntime.changeText("postalCode", "  20001  ");
    formRuntime.changeText("country", "us");
    formRuntime.changeChecked("isPrimary", true);
    render();
    expect(formRuntime.button("Create address").props["disabled"]).toBe(false);
    formRuntime.click("Cancel");
    expect(onCancel).toHaveBeenCalledOnce();

    await formRuntime.submit();
    return expect(onSave).toHaveBeenCalledWith({
      city: "Example City",
      country: "US",
      isPrimary: true,
      line1: "100 Example Avenue",
      line2: "Suite 200",
      postalCode: "20001",
      region: "DC",
      type: "work",
    });
  });

  it("submits a versioned edit patch without exposing primary mutation", async () => {
    const onSave = vi.fn();
    const render = () =>
      renderToStaticMarkup(
        <AddressForm
          initialAddress={address}
          onCancel={vi.fn()}
          onSave={onSave}
        />
      );

    const html = render();
    expect(html).toContain("Edit address");
    expect(html).not.toContain("Make this the primary address");
    expect(formRuntime.button("Save address").props["disabled"]).toBe(true);

    formRuntime.changeText("city", "  Changed City  ");
    formRuntime.changeText("line2", "");
    await formRuntime.submit();
    return expect(onSave).toHaveBeenCalledWith({
      city: "Changed City",
      expectedUpdatedAt: address.updatedAt,
      id: address.id,
      line2: null,
    });
  });

  it("renders a nullable saved address line as an empty editable value", () => {
    renderToStaticMarkup(
      <AddressForm
        initialAddress={{ ...address, line2: null }}
        onCancel={vi.fn()}
        onSave={vi.fn()}
      />
    );

    return expect(formRuntime.control("line2").props["value"]).toBe("");
  });

  return it("disables all controls externally and exposes truthful in-flight save state", async () => {
    const blockedHtml = renderToStaticMarkup(
      <AddressForm disabled onCancel={vi.fn()} onSave={vi.fn()} />
    );
    expect(blockedHtml).toContain("Add an address");
    expect(formRuntime.control("line1").props["disabled"]).toBe(true);
    expect(formRuntime.button("Create address").props["disabled"]).toBe(true);
    expect(formRuntime.button("Cancel").props["disabled"]).toBe(true);

    formRuntime.reset();
    const save = deferred<void>();
    const render = () =>
      renderToStaticMarkup(
        <AddressForm onCancel={vi.fn()} onSave={() => save.promise} />
      );
    render();
    formRuntime.changeText("line1", "100 Example Avenue");
    formRuntime.changeText("city", "Example City");
    formRuntime.changeText("region", "DC");
    formRuntime.changeText("postalCode", "20001");
    formRuntime.changeText("country", "US");
    const submission = formRuntime.submit();
    render();
    expect(formRuntime.button("Create address").props["loading"]).toBe(true);
    expect(formRuntime.button("Create address").props["loadingLabel"]).toBe(
      "Saving address"
    );
    expect(formRuntime.button("Create address").props["disabled"]).toBe(true);
    expect(formRuntime.button("Cancel").props["disabled"]).toBe(true);
    save.resolve();
    return await submission;
  });
});

describe("profile form behavior", () => {
  it("validates required, maximum, malformed URL, and insecure URL boundaries accessibly", () => {
    const render = () =>
      renderToStaticMarkup(
        <ProfileForm initialProfile={profile} onSave={vi.fn()} />
      );
    render();
    expect(formRuntime.control("biography").props["maxLength"]).toBe(5000);
    expect(formRuntime.control("timezone").props["aria-required"]).toBe(true);

    formRuntime.changeText("timezone", "   ");
    formRuntime.blur("timezone");
    formRuntime.changeText("locale", "");
    formRuntime.blur("locale");
    formRuntime.changeText("firstName", "x".repeat(201));
    formRuntime.blur("firstName");
    formRuntime.changeText("avatarUrl", "not a url");
    formRuntime.blur("avatarUrl");
    let html = render();
    expect(html).toContain("Timezone is required.");
    expect(html).toContain("Locale is required.");
    expect(html).toContain("First name must be 200 characters or fewer.");
    expect(html).toContain("Enter a valid avatar URL.");
    expect(formRuntime.control("avatarUrl").props["aria-describedby"]).toBe(
      "avatarUrl-error"
    );

    formRuntime.changeText("firstName", "x".repeat(200));
    formRuntime.blur("firstName");
    formRuntime.changeText("avatarUrl", "http://example.test/avatar.png");
    formRuntime.blur("avatarUrl");
    html = render();
    expect(html).not.toContain("First name must be");
    expect(html).toContain("Avatar URL must use HTTPS.");

    formRuntime.changeText("avatarUrl", "https://example.test/avatar.png");
    formRuntime.blur("avatarUrl");
    html = render();
    return expect(html).not.toContain("Avatar URL must use HTTPS.");
  });

  it("submits only normalized owner changes with the loaded version", async () => {
    const onSave = vi.fn();
    const render = () =>
      renderToStaticMarkup(
        <ProfileForm initialProfile={profile} onSave={onSave} />
      );
    render();
    formRuntime.changeText("firstName", "   ");
    formRuntime.changeText("lastName", "  Adams  ");
    formRuntime.changeText("avatarUrl", "");
    formRuntime.changeText("biography", "  Updated owner biography.  ");
    formRuntime.changeText("timezone", "  UTC  ");
    formRuntime.changeText("locale", "  en-GB  ");
    formRuntime.changeText("dateOfBirth", "");
    await formRuntime.submit();
    return expect(onSave).toHaveBeenCalledWith({
      avatarUrl: null,
      biography: "Updated owner biography.",
      dateOfBirth: null,
      expectedUpdatedAt: profile.updatedAt,
      firstName: null,
      locale: "en-GB",
      timezone: "UTC",
    });
  });

  return it("keeps the save action disabled until dirty and while submission is pending", async () => {
    const save = deferred<void>();
    const render = () =>
      renderToStaticMarkup(
        <ProfileForm initialProfile={profile} onSave={() => save.promise} />
      );
    render();
    expect(formRuntime.button("Save profile").props["disabled"]).toBe(true);
    formRuntime.changeText("jobTitle", "Maintainer");
    render();
    expect(formRuntime.button("Save profile").props["disabled"]).toBe(false);
    const submission = formRuntime.submit();
    render();
    expect(formRuntime.button("Save profile").props["disabled"]).toBe(true);
    expect(formRuntime.button("Save profile").props["loading"]).toBe(true);
    expect(formRuntime.button("Save profile").props["loadingLabel"]).toBe(
      "Saving profile"
    );
    save.resolve();
    return await submission;
  });
});

describe("password form behavior", () => {
  it("announces required, minimum-length, and confirmation errors before saving", async () => {
    const onSave = vi.fn();
    const render = () => renderToStaticMarkup(<PasswordForm onSave={onSave} />);
    render();
    expect(formRuntime.button("Change password").props["disabled"]).toBe(true);

    await formRuntime.submit();
    let html = render();
    expect(html).toContain("Current password is required.");
    expect(html).toContain("New password is required.");
    expect(html).toContain("Confirm new password is required.");
    expect(onSave).not.toHaveBeenCalled();

    formRuntime.changeText("currentPassword", "current-password");
    formRuntime.changeText("newPassword", "12345678901");
    formRuntime.changeText("confirmPassword", "12345678901");
    await formRuntime.submit();
    html = render();
    expect(html).toContain("New password must be at least 12 characters.");

    formRuntime.changeText("newPassword", "123456789012");
    formRuntime.changeText("confirmPassword", "different-password");
    await formRuntime.submit();
    html = render();
    expect(html).toContain("Passwords do not match.");
    return expect(
      formRuntime.control("confirmPassword").props["aria-invalid"]
    ).toBe(true);
  });

  it("validates password corrections as each field loses focus", () => {
    const render = () =>
      renderToStaticMarkup(<PasswordForm onSave={vi.fn()} />);
    render();

    formRuntime.blur("currentPassword");
    let html = render();
    expect(html).toContain("Current password is required.");

    formRuntime.changeText("currentPassword", "current-password");
    formRuntime.blur("currentPassword");
    formRuntime.changeText("newPassword", "12345678901");
    formRuntime.blur("newPassword");
    html = render();
    expect(html).not.toContain("Current password is required.");
    expect(html).toContain("New password must be at least 12 characters.");

    formRuntime.changeText("newPassword", "123456789012");
    formRuntime.blur("newPassword");
    formRuntime.changeText("confirmPassword", "different-password");
    formRuntime.blur("confirmPassword");
    html = render();
    expect(html).not.toContain("New password must be at least 12 characters.");
    expect(html).toContain("Passwords do not match.");

    formRuntime.changeText("confirmPassword", "123456789012");
    formRuntime.blur("confirmPassword");
    html = render();
    return expect(html).not.toContain("Passwords do not match.");
  });

  return it("submits the exact 12-character boundary, respects session choice, and reports pending state", async () => {
    const save = deferred<void>();
    const onSave = vi.fn(() => save.promise);
    const render = () => renderToStaticMarkup(<PasswordForm onSave={onSave} />);
    let html = render();
    expect(html).toContain("All other sessions will sign out");

    formRuntime.changeText("currentPassword", "current-password");
    formRuntime.changeText("newPassword", "123456789012");
    formRuntime.changeText("confirmPassword", "123456789012");
    formRuntime.changeChecked("revokeOtherSessions", false);
    html = render();
    expect(html).toContain("Other sessions will remain active");
    expect(formRuntime.button("Change password").props["disabled"]).toBe(false);

    const submission = formRuntime.submit();
    expect(onSave).toHaveBeenCalledWith({
      currentPassword: "current-password",
      newPassword: "123456789012",
      revokeOtherSessions: false,
    });
    render();
    expect(formRuntime.button("Change password").props["disabled"]).toBe(true);
    expect(formRuntime.button("Change password").props["loading"]).toBe(true);
    expect(formRuntime.button("Change password").props["loadingLabel"]).toBe(
      "Changing password"
    );
    save.resolve();
    return await submission;
  });
});

describe("native account form submission", () => {
  it("prevents browser navigation, focuses an invalid address field, and treats explicit null as create mode", async () => {
    const focus = vi.fn();
    const querySelector = vi
      .fn()
      .mockReturnValueOnce({ focus })
      .mockReturnValueOnce(null);
    vi.stubGlobal("document", { querySelector });
    const onSave = vi.fn();
    let tree = AddressForm({ initialAddress: null, onCancel: vi.fn(), onSave });
    let html = renderToStaticMarkup(tree);
    expect(html).toContain("Add an address");
    expect(html).toContain("Make this the primary address");

    let event = invokeNativeSubmit(tree);
    await flushMicrotasks();
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.stopPropagation).toHaveBeenCalledOnce();
    expect(querySelector).toHaveBeenCalledWith(
      '#address-form [aria-invalid="true"]'
    );
    expect(focus).toHaveBeenCalledOnce();
    expect(onSave).not.toHaveBeenCalled();

    formRuntime.changeText("line1", "100 Example Avenue");
    formRuntime.changeText("city", "Example City");
    formRuntime.changeText("region", "DC");
    formRuntime.changeText("postalCode", "20001");
    formRuntime.changeText("country", "us");
    tree = AddressForm({ initialAddress: null, onCancel: vi.fn(), onSave });
    html = renderToStaticMarkup(tree);
    expect(html).not.toContain("is required.");
    event = invokeNativeSubmit(tree);
    await flushMicrotasks();
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.stopPropagation).toHaveBeenCalledOnce();
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ country: "US" })
    );
    return expect(querySelector).toHaveBeenCalledTimes(2);
  });

  it("initializes every nullable profile field, focuses invalid required input, and submits through the native boundary", async () => {
    const nullableProfile = {
      ...profile,
      avatarUrl: null,
      biography: null,
      businessName: null,
      dateOfBirth: null,
      displayName: null,
      firstName: null,
      jobTitle: null,
      lastName: null,
      phone: null,
    };
    const focus = vi.fn();
    const querySelector = vi
      .fn()
      .mockReturnValueOnce({ focus })
      .mockReturnValueOnce(null);
    vi.stubGlobal("document", { querySelector });
    const onSave = vi.fn();
    let tree = ProfileForm({ initialProfile: nullableProfile, onSave });
    let html = renderToStaticMarkup(tree);
    expect(html).not.toContain('value="null"');
    expect(html).toContain("Biography (optional)");

    formRuntime.changeText("timezone", " ");
    tree = ProfileForm({ initialProfile: nullableProfile, onSave });
    renderToStaticMarkup(tree);
    let event = invokeNativeSubmit(tree);
    await flushMicrotasks();
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.stopPropagation).toHaveBeenCalledOnce();
    expect(focus).toHaveBeenCalledOnce();
    expect(onSave).not.toHaveBeenCalled();

    formRuntime.changeText("timezone", "UTC");
    formRuntime.changeText("jobTitle", "Maintainer");
    tree = ProfileForm({ initialProfile: nullableProfile, onSave });
    html = renderToStaticMarkup(tree);
    expect(html).not.toContain("Timezone is required.");
    event = invokeNativeSubmit(tree);
    await flushMicrotasks();
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.stopPropagation).toHaveBeenCalledOnce();
    expect(onSave).toHaveBeenCalledWith({
      expectedUpdatedAt: nullableProfile.updatedAt,
      jobTitle: "Maintainer",
      timezone: "UTC",
    });
    return expect(querySelector).toHaveBeenCalledTimes(2);
  });

  return it("focuses password validation and submits a valid password through the native event handler", async () => {
    const focus = vi.fn();
    const querySelector = vi
      .fn()
      .mockReturnValueOnce({ focus })
      .mockReturnValueOnce(null);
    vi.stubGlobal("document", { querySelector });
    const onSave = vi.fn();
    let tree = PasswordForm({ onSave });
    renderToStaticMarkup(tree);

    let event = invokeNativeSubmit(tree);
    await flushMicrotasks();
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.stopPropagation).toHaveBeenCalledOnce();
    expect(querySelector).toHaveBeenCalledWith(
      '#password-form [aria-invalid="true"]'
    );
    expect(focus).toHaveBeenCalledOnce();
    expect(onSave).not.toHaveBeenCalled();

    formRuntime.changeText("currentPassword", "current-password");
    formRuntime.changeText("newPassword", "123456789012");
    formRuntime.changeText("confirmPassword", "123456789012");
    tree = PasswordForm({ onSave });
    renderToStaticMarkup(tree);
    event = invokeNativeSubmit(tree);
    await flushMicrotasks();
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.stopPropagation).toHaveBeenCalledOnce();
    expect(onSave).toHaveBeenCalledWith({
      currentPassword: "current-password",
      newPassword: "123456789012",
      revokeOtherSessions: true,
    });
    return expect(querySelector).toHaveBeenCalledTimes(2);
  });
});

describe("preferences form behavior", () =>
  it("updates every owner choice without appearance controls and exposes native pending state", async () => {
    const save = deferred<void>();
    const onSave = vi.fn(() => save.promise);
    let tree = PreferencesForm({ initialPreferences: preferences, onSave });
    let html = renderToStaticMarkup(tree);
    expect(html).not.toContain("Current appearance");
    expect(html).toContain("Notifications and consent");
    expect(
      formRuntime.control("profileVisibility").props["aria-describedby"]
    ).toBeUndefined();
    expect(formRuntime.button("Save preferences").props["disabled"]).toBe(true);

    formRuntime.changeChecked("emailNotifications", false);
    formRuntime.changeChecked("productUpdates", true);
    formRuntime.changeChecked("analyticsConsent", true);
    formRuntime.changeChecked("personalizationConsent", false);
    formRuntime.changeText("profileVisibility", "public");
    for (const field of [
      "emailNotifications",
      "productUpdates",
      "analyticsConsent",
      "personalizationConsent",
      "profileVisibility",
    ])
      formRuntime.blur(field);
    tree = PreferencesForm({ initialPreferences: preferences, onSave });
    html = renderToStaticMarkup(tree);
    expect(html).toContain(">Public<");
    expect(formRuntime.button("Save preferences").props["disabled"]).toBe(
      false
    );

    const event = invokeNativeSubmit(tree);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.stopPropagation).toHaveBeenCalledOnce();
    expect(onSave).toHaveBeenCalledWith({
      analyticsConsent: true,
      emailNotifications: false,
      expectedUpdatedAt: preferences.updatedAt,
      personalizationConsent: false,
      productUpdates: true,
      profileVisibility: "public",
    });
    tree = PreferencesForm({ initialPreferences: preferences, onSave });
    renderToStaticMarkup(tree);
    expect(formRuntime.button("Save preferences").props["disabled"]).toBe(true);
    expect(formRuntime.button("Save preferences").props["loading"]).toBe(true);
    expect(formRuntime.button("Save preferences").props["loadingLabel"]).toBe(
      "Saving preferences"
    );
    save.resolve();
    return await flushMicrotasks();
  }));
