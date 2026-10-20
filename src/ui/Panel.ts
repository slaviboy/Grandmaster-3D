/*
 * Copyright (C) 2026 Stanislav Georgiev
 * https://github.com/slaviboy
 *
 * This file is part of Grandmaster 3D.
 *
 * Grandmaster 3D is free software: you can redistribute it and/or modify it under the terms of the
 * GNU General Public License as published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version. See the LICENSE file for the full terms.
 */

// A floating window in the game's style: a header with its title, a collapse arrow and a close
// cross, over a translucent teal body.

export interface PanelOptions {
  readonly id: string;
  readonly title: string;
  readonly collapsed?: boolean;
  /** Extra header buttons placed before the collapse arrow. */
  readonly extraButtons?: ReadonlyArray<{ label: string; title: string; onClick: () => void }>;
}

export class Panel {
  readonly element: HTMLElement;
  readonly body: HTMLElement;
  private readonly collapseButton: HTMLButtonElement;
  private readonly listeners = new Set<() => void>();

  constructor(options: PanelOptions) {
    this.element = document.createElement('section');
    this.element.className = 'panel';
    this.element.id = options.id;
    this.element.setAttribute('aria-label', options.title);
    const header = document.createElement('div');
    header.className = 'panel-header';
    const title = document.createElement('span');
    title.className = 'title';
    title.textContent = options.title;
    header.append(title);
    for (const extra of options.extraButtons ?? []) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = extra.label;
      button.title = extra.title;
      button.setAttribute('aria-label', extra.title);
      button.addEventListener('click', extra.onClick);
      header.append(button);
    }
    this.collapseButton = document.createElement('button');
    this.collapseButton.type = 'button';
    this.collapseButton.addEventListener('click', () => this.setCollapsed(!this.collapsed));
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = 'X';
    close.title = 'Close';
    close.setAttribute('aria-label', `Close ${options.title}`);
    close.addEventListener('click', () => this.setVisible(false));
    header.append(this.collapseButton, close);
    this.body = document.createElement('div');
    this.body.className = 'panel-body';
    this.element.append(header, this.body);
    this.setCollapsed(options.collapsed ?? false);
  }

  get collapsed(): boolean {
    return this.element.classList.contains('collapsed');
  }

  get visible(): boolean {
    return !this.element.hidden;
  }

  setCollapsed(collapsed: boolean): void {
    this.element.classList.toggle('collapsed', collapsed);
    this.collapseButton.textContent = collapsed ? '▾' : '▴';
    this.collapseButton.title = collapsed ? 'Expand' : 'Collapse';
    this.collapseButton.setAttribute('aria-expanded', String(!collapsed));
    this.notify();
  }

  setVisible(visible: boolean): void {
    this.element.hidden = !visible;
    this.notify();
  }

  onChange(listener: () => void): void {
    this.listeners.add(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}
