import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { checkboxReducer } from '../store/checkboxSlice';
import { CheckboxPageContainer } from './CheckboxPageContainer';
import { aiFeatureBackend } from '../demo/mockBackend';

function renderPage() {
  const store = configureStore({ reducer: { checkboxes: checkboxReducer } });
  render(
    <Provider store={store}>
      <CheckboxPageContainer backend={aiFeatureBackend} />
    </Provider>,
  );
  return store;
}

describe('CheckboxPageContainer (§3, end-to-end UI)', () => {
  it('checking EDIT auto-checks its VIEW (FE invariant through the UI)', async () => {
    const user = userEvent.setup();
    renderPage();
    const editDescription = await screen.findByRole('checkbox', { name: 'Description edit' });
    const viewDescription = screen.getByRole('checkbox', { name: 'Description view' });
    expect(viewDescription).not.toBeChecked();
    await user.click(editDescription);
    expect(editDescription).toBeChecked();
    expect(viewDescription).toBeChecked();
  });

  it('renders a category aggregate as mixed when partially checked', async () => {
    renderPage();
    // Properties has Owner VIEW checked by default → VIEW aggregate is indeterminate
    const propsAggregate = await screen.findByRole('checkbox', { name: 'Properties VIEW (all)' });
    expect(propsAggregate).toHaveAttribute('aria-checked', 'mixed');
  });

  it('hides the FIELD table when the enable_fields controller is unchecked', async () => {
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByRole('treegrid', { name: 'Fields' })).toBeInTheDocument();
    const enable = screen.getByRole('checkbox', { name: 'Enable Fields' });
    await user.click(enable);
    expect(screen.queryByRole('treegrid', { name: 'Fields' })).not.toBeInTheDocument();
    expect(screen.getByText(/Fields are hidden/i)).toBeInTheDocument();
  });

  it('switches status without losing the other status’ state', async () => {
    const user = userEvent.setup();
    const store = renderPage();
    const editDescription = await screen.findByRole('checkbox', { name: 'Description edit' });
    await user.click(editDescription); // check in IN_PROGRESS
    await user.click(screen.getByRole('tab', { name: 'IN REVIEW' }));
    // IN_REVIEW description edit is independent (unchecked)
    const reviewEdit = screen.getByRole('checkbox', { name: 'Description edit' });
    expect(reviewEdit).not.toBeChecked();
    // underlying IN_PROGRESS state preserved
    expect(store.getState().checkboxes['AI_FEATURE/IN_PROGRESS/EDIT/description'].checked).toBe(true);
  });

  it('a category aggregate click cascades to the column', async () => {
    const user = userEvent.setup();
    const store = renderPage();
    const secAgg = await screen.findByRole('checkbox', { name: 'Security EDIT (all)' });
    await user.click(secAgg);
    const s = store.getState().checkboxes;
    expect(s['AI_FEATURE/IN_PROGRESS/EDIT/security.roles'].checked).toBe(true);
    expect(s['AI_FEATURE/IN_PROGRESS/EDIT/security.audit'].checked).toBe(true);
    // EDIT⇒VIEW invariant also pulled the VIEWs on
    expect(s['AI_FEATURE/IN_PROGRESS/VIEW/security.roles'].checked).toBe(true);
  });
});
