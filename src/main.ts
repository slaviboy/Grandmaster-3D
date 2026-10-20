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

import './styles/base.css';
import './styles/theme.css';
import { App } from './app/App.ts';

const root = document.getElementById('app');
if (!root) throw new Error('missing #app');
const app = new App(root);
app.ready.catch((error: Error) => {
  console.error(error);
  const message = document.createElement('div');
  message.className = 'load-error';
  message.textContent = `The game could not start: ${error.message}`;
  document.body.append(message);
});
