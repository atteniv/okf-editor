import "./App.css";
import { BundleView } from "./BundleView";
import { StartScreen } from "./StartScreen";
import { useStore } from "./store";

function App() {
  const view = useStore((state) => state.view);
  return view === "bundle" ? <BundleView /> : <StartScreen />;
}

export default App;
