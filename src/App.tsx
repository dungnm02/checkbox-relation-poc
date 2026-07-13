import { useState } from 'react';
import { Provider } from 'react-redux';
import { store } from './store/store';
import { demoResources } from './demo/mockBackend';
import { CheckboxPageContainer } from './components/CheckboxPageContainer';
import './app.css';

export function App() {
  const [key, setKey] = useState(demoResources[0].key);
  const resource = demoResources.find((r) => r.key === key)!;

  return (
    <Provider store={store}>
      <div className="app">
        <h1>Rule Set — Create</h1>
        <label className="resource-picker">
          Resource
          <select value={key} onChange={(e) => setKey(e.target.value)}>
            {demoResources.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        {/* key forces a fresh compile + seed when the resource changes */}
        <CheckboxPageContainer key={key} backend={resource.backend} />
      </div>
    </Provider>
  );
}
