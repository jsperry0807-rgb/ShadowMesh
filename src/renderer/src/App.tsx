import { Toaster } from 'react-hot-toast'
import Chat from './page/Chat'

function App(): React.JSX.Element {
  // const ipcHandle = (): void => window.electron.ipcRenderer.send('ping')

  return (
    <div className="App">
      <Toaster position="top-right" />
      <Chat />
    </div>
  )
}

export default App
