import { useEffect, useRef, useState } from 'react'
import './App.css'
import welcomeImage from './assets/wlsc.jpg'
import {
  extractBill,
  getApiBaseUrl,
  getSplitResults,
  setExpectedPeople,
} from './lib/api'
import type { LocalBillItem, SplitResponse } from './types/api'

type Screen = 'welcome' | 'home' | 'scan'

const initialResults: SplitResponse = {
  allSubmitted: false,
  currency: '',
  expectedUsers: 0,
  items: [],
  numSubmitted: 0,
  total: 0,
  users: {},
}

function App() {
  const [screen, setScreen] = useState<Screen>('welcome')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [billId, setBillId] = useState('')
  const [items, setItems] = useState<LocalBillItem[]>([])
  const [billTotal, setBillTotal] = useState<number | null>(null)
  const [currency, setCurrency] = useState('')
  const [totalPeople, setTotalPeople] = useState(2)
  const [shareLink, setShareLink] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [isGeneratingLink, setIsGeneratingLink] = useState(false)
  const [error, setError] = useState('')
  const [splitResults, setSplitResults] = useState<SplitResponse>(initialResults)
  const [copied, setCopied] = useState(false)
  const cameraInputRef = useRef<HTMLInputElement | null>(null)
  const galleryInputRef = useRef<HTMLInputElement | null>(null)
  const copiedTimerRef = useRef<number | null>(null)

  useEffect(() => {
    if (!shareLink || !billId) {
      return
    }

    let cancelled = false

    const poll = async () => {
      try {
        const data = await getSplitResults(billId)

        if (!cancelled) {
          setSplitResults(data)
        }
      } catch {
        // Ignore transient polling errors and retry on the next interval.
      }
    }

    void poll()
    const intervalId = window.setInterval(() => {
      void poll()
    }, 3000)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [billId, shareLink])

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl)
      }

      if (copiedTimerRef.current) {
        window.clearTimeout(copiedTimerRef.current)
      }
    }
  }, [previewUrl])

  const resetBillState = () => {
    setBillId('')
    setItems([])
    setBillTotal(null)
    setCurrency('')
    setTotalPeople(2)
    setShareLink('')
    setSplitResults(initialResults)
    setError('')
    setCopied(false)
  }

  const handleGetStarted = () => {
    setScreen('home')
  }

  const handleBackToWelcome = () => {
    resetBillState()
    setSelectedFile(null)

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
      setPreviewUrl('')
    }

    setScreen('welcome')
  }

  const handleBackToHome = () => {
    resetBillState()
    setSelectedFile(null)

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
      setPreviewUrl('')
    }

    setScreen('home')
  }

  const openCameraPicker = () => {
    cameraInputRef.current?.click()
  }

  const openGalleryPicker = () => {
    galleryInputRef.current?.click()
  }

  const handleFileSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file) {
      return
    }

    resetBillState()

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
    }

    setSelectedFile(file)
    setPreviewUrl(URL.createObjectURL(file))
    setScreen('scan')
  }

  const handleExtractItems = async () => {
    if (!selectedFile || isProcessing) {
      return
    }

    setIsProcessing(true)
    setError('')

    try {
      const response = await extractBill(selectedFile)

      setBillId(response.bill_id ?? '')
      setBillTotal(response.total ?? 0)
      setCurrency(response.currency ?? '')
      setItems(
        response.items.map((item, index) => ({
          id: `item-${index}`,
          name: item.name || 'Unknown',
          price: Number(item.price) || 0,
          type: item.type,
        })),
      )
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to extract bill items.'
      setError(message)
    } finally {
      setIsProcessing(false)
    }
  }

  const updateItem = (
    id: string,
    field: 'name' | 'price',
    value: string | number,
  ) => {
    setItems((currentItems) =>
      currentItems.map((item) =>
        item.id === id
          ? {
              ...item,
              [field]:
                field === 'price' ? Number(value) || 0 : String(value),
            }
          : item,
      ),
    )
  }

  const addItem = () => {
    setItems((currentItems) => [
      ...currentItems,
      { id: `item-${Date.now()}`, name: '', price: 0, type: 'item' },
    ])
  }

  const deleteItem = (id: string) => {
    setItems((currentItems) => currentItems.filter((item) => item.id !== id))
  }

  const handleGenerateLink = async () => {
    if (!billId || isGeneratingLink) {
      return
    }

    setIsGeneratingLink(true)
    setError('')

    try {
      await setExpectedPeople(billId, { totalPeople })
      setShareLink(`${getApiBaseUrl()}/bill/${billId}`)
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to generate share link.'
      setError(message)
    } finally {
      setIsGeneratingLink(false)
    }
  }

  const handleCopyLink = async () => {
    if (!shareLink) {
      return
    }

    try {
      await navigator.clipboard.writeText(shareLink)
      setCopied(true)

      if (copiedTimerRef.current) {
        window.clearTimeout(copiedTimerRef.current)
      }

      copiedTimerRef.current = window.setTimeout(() => {
        setCopied(false)
      }, 1800)
    } catch {
      setError('Clipboard access failed. Copy the link manually from the field.')
    }
  }

  const displayedTotal = billTotal ?? items.reduce((sum, item) => sum + item.price, 0)
  const progress =
    splitResults.expectedUsers && splitResults.expectedUsers > 0
      ? Math.min(
          100,
          ((splitResults.numSubmitted ?? 0) / splitResults.expectedUsers) * 100,
        )
      : 0

  return (
    <div className="app-shell">
      <input
        ref={cameraInputRef}
        className="sr-only"
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileSelected}
      />
      <input
        ref={galleryInputRef}
        className="sr-only"
        type="file"
        accept="image/*"
        onChange={handleFileSelected}
      />

      {screen === 'welcome' ? (
        <WelcomeScreen onGetStarted={handleGetStarted} />
      ) : null}

      {screen === 'home' ? (
        <HomeScreen
          onBack={handleBackToWelcome}
          onOpenCamera={openCameraPicker}
          onOpenGallery={openGalleryPicker}
        />
      ) : null}

      {screen === 'scan' ? (
        <main className="scan-page">
          <header className="app-header">
            <button className="icon-button" type="button" onClick={handleBackToHome}>
              <span aria-hidden="true">←</span>
            </button>
            <div>
              <p className="eyebrow">Receipt workflow</p>
              <h1>Bill Scanner</h1>
            </div>
            <button className="ghost-button" type="button" onClick={openGalleryPicker}>
              Choose another
            </button>
          </header>

          <div className="scan-layout">
            <section className="panel panel-image">
              <div className="panel-heading">
                <span className="panel-kicker">Preview</span>
                <h2>Review the uploaded receipt</h2>
              </div>

              {previewUrl ? (
                <div className="receipt-preview">
                  <img src={previewUrl} alt="Uploaded receipt preview" />
                  <div className="receipt-chip">Ready for extraction</div>
                </div>
              ) : null}

              <div className="action-row">
                <button
                  className="primary-button"
                  type="button"
                  onClick={handleExtractItems}
                  disabled={isProcessing || items.length > 0}
                >
                  {isProcessing
                    ? 'Extracting items...'
                    : items.length > 0
                      ? 'Items Extracted'
                      : 'Extract Items'}
                </button>
                <button className="secondary-button" type="button" onClick={openCameraPicker}>
                  Retake
                </button>
              </div>

              <p className="support-copy">
                Splito sends your receipt to the OCR backend, converts it into items,
                then lets you clean up the split before sharing the bill.
              </p>

              {error ? <div className="error-banner">{error}</div> : null}
            </section>

            <section className="panel panel-summary">
              <div className="panel-heading">
                <span className="panel-kicker">Snapshot</span>
                <h2>Current bill status</h2>
              </div>

              <dl className="stats-grid">
                <div>
                  <dt>Items</dt>
                  <dd>{items.length}</dd>
                </div>
                <div>
                  <dt>Total</dt>
                  <dd>
                    {currency ? `${currency} ` : ''}
                    {displayedTotal.toFixed(2)}
                  </dd>
                </div>
                <div>
                  <dt>People</dt>
                  <dd>{totalPeople}</dd>
                </div>
                <div>
                  <dt>Bill ID</dt>
                  <dd>{billId || 'Pending'}</dd>
                </div>
              </dl>
            </section>
          </div>

          {items.length > 0 ? (
            <section className="panel">
              <div className="panel-heading panel-heading-inline">
                <div>
                  <span className="panel-kicker">Items</span>
                  <h2>Clean up the extracted receipt</h2>
                </div>
                <span className="count-badge">{items.length}</span>
              </div>

              <div className="items-list">
                {items.map((item) => (
                  <div className="item-row" key={item.id}>
                    <input
                      className="text-input"
                      type="text"
                      value={item.name}
                      onChange={(event) =>
                        updateItem(item.id, 'name', event.target.value)
                      }
                      placeholder="Item name"
                    />
                    <input
                      className="price-input"
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.price}
                      onChange={(event) =>
                        updateItem(item.id, 'price', event.target.value)
                      }
                      placeholder="0.00"
                    />
                    <button
                      className="delete-button"
                      type="button"
                      onClick={() => deleteItem(item.id)}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>

              <div className="panel-actions">
                <button className="secondary-button" type="button" onClick={addItem}>
                  Add Item
                </button>
                <div className="total-box">
                  <span>Total</span>
                  <strong>
                    {currency ? `${currency} ` : ''}
                    {displayedTotal.toFixed(2)}
                  </strong>
                </div>
              </div>
            </section>
          ) : null}

          {items.length > 0 && !shareLink ? (
            <section className="panel">
              <div className="panel-heading">
                <span className="panel-kicker">Split settings</span>
                <h2>Choose the number of people</h2>
              </div>

              <div className="settings-row">
                <div>
                  <p className="settings-label">People</p>
                  <p className="settings-help">
                    Set how many diners should receive the bill link.
                  </p>
                </div>

                <div className="counter">
                  <button
                    className="counter-button"
                    type="button"
                    onClick={() =>
                      setTotalPeople((currentPeople) =>
                        Math.max(1, currentPeople - 1),
                      )
                    }
                  >
                    −
                  </button>
                  <input
                    className="counter-input"
                    type="number"
                    min="1"
                    max="50"
                    value={totalPeople}
                    onChange={(event) =>
                      setTotalPeople(
                        Math.min(
                          50,
                          Math.max(1, Number(event.target.value) || 1),
                        ),
                      )
                    }
                  />
                  <button
                    className="counter-button"
                    type="button"
                    onClick={() =>
                      setTotalPeople((currentPeople) =>
                        Math.min(50, currentPeople + 1),
                      )
                    }
                  >
                    +
                  </button>
                </div>
              </div>

              <button
                className="primary-button"
                type="button"
                onClick={handleGenerateLink}
                disabled={!billId || isGeneratingLink}
              >
                {isGeneratingLink ? 'Generating link...' : 'Generate Link'}
              </button>

              {!billId ? (
                <p className="helper-text">Extract the receipt first to create a bill ID.</p>
              ) : null}
            </section>
          ) : null}

          {shareLink ? (
            <section className="panel">
              <div className="panel-heading">
                <span className="panel-kicker">Share link</span>
                <h2>Send this to the group</h2>
              </div>

              <p className="share-copy">Share with {totalPeople} people and watch submissions live.</p>

              <div className="share-row">
                <input className="share-input" type="text" value={shareLink} readOnly />
                <button className="secondary-button" type="button" onClick={handleCopyLink}>
                  {copied ? 'Copied' : 'Copy'}
                </button>
                <a className="secondary-button link-button" href={shareLink} target="_blank" rel="noreferrer">
                  Open
                </a>
              </div>
            </section>
          ) : null}

          {shareLink ? (
            <section className="panel">
              <div className="panel-heading">
                <span className="panel-kicker">Results</span>
                <h2>Track responses in real time</h2>
              </div>

              {!splitResults.allSubmitted ? (
                <div className="waiting-card">
                  <div className="progress-meta">
                    <strong>Waiting for everyone</strong>
                    <span>
                      {splitResults.numSubmitted ?? 0} of{' '}
                      {splitResults.expectedUsers ?? totalPeople} submitted
                    </span>
                  </div>
                  <div className="progress-track">
                    <div
                      className="progress-fill"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              ) : (
                <div className="results-stack">
                  {Object.entries(splitResults.users ?? {})
                    .sort(([, left], [, right]) => right.total - left.total)
                    .map(([userId, userData]) => (
                      <article className="user-card" key={userId}>
                        <div className="user-card-header">
                          <div className="avatar">{userData.name.charAt(0).toUpperCase()}</div>
                          <div>
                            <h3>{userData.name}</h3>
                            <p>{userData.items?.length ?? 0} items</p>
                          </div>
                          <strong>
                            {currency ? `${currency} ` : ''}
                            {userData.total.toFixed(2)}
                          </strong>
                        </div>

                        {userData.items?.length ? (
                          <div className="line-items">
                            {userData.items.map((item) => (
                              <div className="line-item" key={`${userId}-${item.name}-${item.share}`}>
                                <span>{item.name}</span>
                                <span>
                                  {currency ? `${currency} ` : ''}
                                  {item.share.toFixed(2)}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </article>
                    ))}

                  {splitResults.items?.length ? (
                    <div className="breakdown-section">
                      <h3>Item Breakdown</h3>
                      <div className="breakdown-list">
                        {splitResults.items.map((item) => (
                          <article className="breakdown-card" key={`${item.name}-${item.price}`}>
                            <div className="breakdown-header">
                              <strong>{item.name}</strong>
                              <span
                                className={
                                  item.type === 'discount'
                                    ? 'amount amount-discount'
                                    : 'amount'
                                }
                              >
                                {currency ? `${currency} ` : ''}
                                {item.price.toFixed(2)}
                              </span>
                            </div>
                            <p className="breakdown-note">
                              Split among{' '}
                              {typeof item.splitAmong === 'number'
                                ? item.splitAmong
                                : 'everyone'}
                            </p>
                            {item.selectors?.length ? (
                              <div className="selectors-list">
                                {item.selectors.map((selector) => (
                                  <div
                                    className="selector-row"
                                    key={`${item.name}-${selector.userId}`}
                                  >
                                    <span>
                                      {splitResults.users?.[selector.userId]?.name ??
                                        selector.userId}
                                    </span>
                                    <span>
                                      {currency ? `${currency} ` : ''}
                                      {selector.share.toFixed(2)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            ) : null}
                          </article>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="grand-total">
                    <span>Grand Total</span>
                    <strong>
                      {currency ? `${currency} ` : ''}
                      {(splitResults.total ?? displayedTotal).toFixed(2)}
                    </strong>
                  </div>
                </div>
              )}
            </section>
          ) : null}
        </main>
      ) : null}
    </div>
  )
}

interface WelcomeScreenProps {
  onGetStarted: () => void
}

function WelcomeScreen({ onGetStarted }: WelcomeScreenProps) {
  return (
    <main className="welcome-page">
      <div className="welcome-aurora" />
      <section className="welcome-copy">
        <span className="badge">FAIR SPLITTING, FINALLY</span>
        <h1>
          Splito: <span>You Eat It, You Pay It.</span>
        </h1>
        <p>
          No more equal splits when one person ordered a salad and another had the
          steak. Splito keeps every bill item-by-item, fair, and drama-free.
        </p>
        <div className="pill-row">
          <span className="pill pill-green">Item-by-item</span>
          <span className="pill pill-blue">Always fair</span>
          <span className="pill pill-gold">Zero drama</span>
        </div>
        <button className="cta-button" type="button" onClick={onGetStarted}>
          Get Started
        </button>
        <small>No credit card. Free to use.</small>
      </section>

      <section className="welcome-visual">
        <div className="image-frame">
          <img src={welcomeImage} alt="Friends sharing a restaurant bill" />
        </div>
      </section>
    </main>
  )
}

interface HomeScreenProps {
  onBack: () => void
  onOpenCamera: () => void
  onOpenGallery: () => void
}

function HomeScreen({ onBack, onOpenCamera, onOpenGallery }: HomeScreenProps) {
  return (
    <main className="home-page">
      <header className="app-header">
        <button className="icon-button" type="button" onClick={onBack}>
          <span aria-hidden="true">←</span>
        </button>
        <div>
          <p className="eyebrow">Splito web</p>
          <h1>Scan Bill</h1>
        </div>
        <div className="header-spacer" />
      </header>

      <section className="home-hero">
        <div>
          <span className="badge badge-home">Receipt in. Fair split out.</span>
          <h2>Upload a receipt and turn it into a shareable split in minutes.</h2>
          <p>
            Capture a fresh photo or upload one from your device. Splito will
            extract line items, let you clean them up, then generate a bill link
            for the rest of the table.
          </p>
        </div>

        <div className="home-cards">
          <button className="home-action camera-action" type="button" onClick={onOpenCamera}>
            <span>Take Photo</span>
            <small>Best on mobile, opens your rear camera when available.</small>
          </button>
          <button className="home-action gallery-action" type="button" onClick={onOpenGallery}>
            <span>Pick from Gallery</span>
            <small>Use an existing receipt image from your laptop or phone.</small>
          </button>
        </div>
      </section>
    </main>
  )
}

export default App
