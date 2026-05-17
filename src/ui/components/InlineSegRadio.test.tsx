// @vitest-environment jsdom
import { render } from "solid-js/web";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InlineSegRadio } from "./InlineSegRadio";

describe("InlineSegRadio", () => {
  let dispose: () => void = () => {};
  afterEach(() => {
    dispose();
    dispose = () => {};
    document.body.innerHTML = "";
  });

  function mount(props: {
    label?: string;
    options?: ReadonlyArray<{ value: string; label: string }>;
    value?: string;
    onChange?: (v: string) => void;
  }): HTMLElement {
    const host = document.createElement("div");
    document.body.appendChild(host);
    dispose = render(
      () => (
        <InlineSegRadio
          label={props.label ?? "sound"}
          options={
            props.options ?? [
              { value: "off", label: "off" },
              { value: "on", label: "on" },
            ]
          }
          value={props.value ?? "off"}
          onChange={props.onChange ?? (() => {})}
        />
      ),
      host,
    );
    return host;
  }

  it("renders the label and one button per option", () => {
    const host = mount({
      label: "sound",
      options: [
        { value: "off", label: "off" },
        { value: "soft", label: "soft" },
        { value: "loud", label: "loud" },
      ],
      value: "off",
    });
    expect(host.querySelector(".inline-seg__label")?.textContent).toBe("sound:");
    const opts = host.querySelectorAll<HTMLButtonElement>(".inline-seg__opt");
    expect(opts).toHaveLength(3);
    expect(Array.from(opts).map((b) => b.textContent)).toEqual(["off", "soft", "loud"]);
  });

  it("marks the active option with --on and sets aria-checked correctly", () => {
    const host = mount({
      options: [
        { value: "a", label: "a" },
        { value: "b", label: "b" },
        { value: "c", label: "c" },
      ],
      value: "b",
    });
    const opts = Array.from(host.querySelectorAll<HTMLButtonElement>(".inline-seg__opt"));
    const onClasses = opts.map((b) => b.classList.contains("inline-seg__opt--on"));
    expect(onClasses).toEqual([false, true, false]);
    const checked = opts.map((b) => b.getAttribute("aria-checked"));
    expect(checked).toEqual(["false", "true", "false"]);
  });

  it("renders n-1 dot separators between options", () => {
    const host = mount({
      options: [
        { value: "a", label: "a" },
        { value: "b", label: "b" },
        { value: "c", label: "c" },
        { value: "d", label: "d" },
      ],
    });
    const seps = host.querySelectorAll(".inline-seg__sep");
    expect(seps).toHaveLength(3);
    for (const s of seps) {
      expect(s.textContent).toBe("·");
    }
  });

  it("fires onChange with the clicked option's value", () => {
    const onChange = vi.fn();
    const host = mount({
      options: [
        { value: "first", label: "first" },
        { value: "second", label: "second" },
      ],
      value: "first",
      onChange,
    });
    const second = Array.from(host.querySelectorAll<HTMLButtonElement>(".inline-seg__opt")).find(
      (b) => b.textContent === "second",
    );
    second?.click();
    expect(onChange).toHaveBeenCalledWith("second");
  });

  it("uses the label as the radiogroup's accessible name", () => {
    const host = mount({ label: "layout" });
    const group = host.querySelector('[role="radiogroup"]');
    expect(group?.getAttribute("aria-label")).toBe("layout");
  });
});
