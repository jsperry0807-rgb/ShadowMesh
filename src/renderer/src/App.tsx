import { Toaster } from 'react-hot-toast'
import Chat from './page/Chat'

function App(): React.JSX.Element {
  return (
    <div className="container mx-auto p-4">
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: '13px',
            borderRadius: '4px'
          }
        }}
      />
      <Chat />
    </div>
  )
}

export default App
