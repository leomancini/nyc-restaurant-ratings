import React, { useState, useRef, useCallback, useEffect } from "react";
import styled, { keyframes } from "styled-components";

const GRAY = "#aaa";

const GRADE_COLORS = {
  A: "#2563EB",
  B: "#16A34A",
  C: "#EA580C",
};

const GRADE_LABELS = {
  A: "A",
  B: "B",
  C: "C",
  Z: "PENDING",
  P: "PENDING",
  N: "N/A",
};

const BORO_NAMES = {
  Manhattan: "MANHATTAN",
  Bronx: "BRONX",
  Brooklyn: "BROOKLYN",
  Queens: "QUEENS",
  "Staten Island": "STATEN ISLAND",
};

const DASHES = "- - - - - - - - - - - - - - - - - -";
const DOTS = ". . . . . . . . . .";

function App() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [detailLoading, setDetailLoading] = useState(() => /^\/restaurant\/\d+/.test(window.location.pathname));
  const [fontsReady, setFontsReady] = useState(false);
  const [now, setNow] = useState(new Date());
  const timerRef = useRef(null);
  const abortRef = useRef(null);
  const hasSelected = useRef(false);

  useEffect(() => {
    document.fonts.ready.then(() => setFontsReady(true));
    const interval = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  const search = useCallback(async (q) => {
    if (abortRef.current) abortRef.current.abort();

    if (q.trim().length < 2) {
      setResults(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
        signal: controller.signal,
      });
      const data = await res.json();
      setResults(data.restaurants);
      setLoading(false);
    } catch (e) {
      if (e.name !== "AbortError") {
        setResults([]);
        setLoading(false);
      }
    }
  }, []);

  const handleInput = (e) => {
    const val = e.target.value;
    setQuery(val);
    setSelected(null);
    clearTimeout(timerRef.current);
    if (val.trim().length < 2) {
      if (abortRef.current) abortRef.current.abort();
      setResults(null);
      setLoading(false);
      return;
    }
    timerRef.current = setTimeout(() => search(val), 400);
  };

  const selectRestaurant = async (camis, name) => {
    setSelected(null);
    setDetailLoading(true);
    window.scrollTo(0, 0);
    try {
      const res = await fetch(`/api/restaurant/${camis}`);
      const data = await res.json();
      setSelected(data);
      const slug = toSlug(name || data.name);
      window.history.pushState(null, "", `/restaurant/${camis}/${slug}`);
    } catch {
      setSelected(null);
    } finally {
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      setDetailLoading(false);
    }
  };

  const goBack = () => {
    hasSelected.current = true;
    setSelected(null);
    window.history.pushState(null, "", "/");
  };

  // Handle slug URLs on load and popstate
  useEffect(() => {
    const loadFromUrl = async () => {
      const path = window.location.pathname;
      const match = path.match(/^\/restaurant\/(\d+)/);
      if (match) {
        const camis = match[1];
        setDetailLoading(true);
        try {
          const res = await fetch(`/api/restaurant/${camis}`);
          const data = await res.json();
          setSelected(data);
        } catch {
          setSelected(null);
        } finally {
          await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
          setDetailLoading(false);
        }
      }
    };
    loadFromUrl();

    const onPopState = () => {
      const path = window.location.pathname;
      if (path === "/") {
        setSelected(null);
      } else {
        loadFromUrl();
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  return (
    <Receipt style={fontsReady ? undefined : {opacity: 0}}>
      <Paper>
        {!selected && !detailLoading && (
          <>
            <Spacer />
            <ReceiptHeader>
              <StoreName>NYC RESTAURANT RATINGS</StoreName>
            </ReceiptHeader>

            <Spacer />
            <Spacer />
            <SearchWrap>
              <SearchBox
                type="text"
                placeholder="SEARCH..."
                value={query}
                onChange={handleInput}
                autoFocus={!hasSelected.current}
                onTouchStart={preventIosKeyboardScroll}
              />
              {query && (
                <ClearButton onClick={() => { setQuery(""); setResults(null); if (abortRef.current) abortRef.current.abort(); }}>
                  CLEAR
                </ClearButton>
              )}
            </SearchWrap>

            {(loading || (results && !loading)) && (
              <>
                <ResultsList>
                {loading && (
                  <ResultItem><ResultRow as="div" style={{cursor: "default", pointerEvents: "none"}}><ResultLeft><ResultDetails><ItemName style={{color: GRAY}}>SEARCHING{dots(3)}</ItemName><ItemAddress>&nbsp;</ItemAddress><ScoreXs>&nbsp;</ScoreXs></ResultDetails></ResultLeft><ResultRight><GradeBox style={{visibility: "hidden"}}>{" "}</GradeBox></ResultRight></ResultRow></ResultItem>
                )}
                {results && !loading && results.length === 0 && (
                  <ResultItem><ResultRow as="div" style={{cursor: "default", pointerEvents: "none"}}><ResultLeft><ResultDetails><ItemName style={{color: GRAY}}>NO RESULTS FOUND</ItemName><ItemAddress>&nbsp;</ItemAddress><ScoreXs>&nbsp;</ScoreXs></ResultDetails></ResultLeft><ResultRight><GradeBox style={{visibility: "hidden"}}>{" "}</GradeBox></ResultRight></ResultRow></ResultItem>
                )}
                {results && !loading && results.map((r, i) => (
                  <ResultItem key={r.camis}>
                    <ResultRow
                      onClick={() => selectRestaurant(r.camis, r.name)}
                    >
                      <ResultLeft>
                        <ResultDetails>
                          <ItemName>{titleCase(r.name)}</ItemName>
                          <ItemAddress>
                            {r.building} {r.street}
                          </ItemAddress>
                          {r.boro && (
                            <ScoreXs>{BORO_NAMES[r.boro] || r.boro}</ScoreXs>
                          )}
                        </ResultDetails>
                      </ResultLeft>
                      <ResultRight>
                        <GradeBox grade={r.grade}>
                          {r.grade === "Z" || r.grade === "N" ? "?" : r.grade || "-"}
                        </GradeBox>
                      </ResultRight>
                    </ResultRow>
                  </ResultItem>
                ))}
                </ResultsList>
              </>
            )}

            {!results && !loading && (
              <EmptyState style={{paddingTop: "16px"}}>
                <LegendSection>
                  <SectionTitle>GRADE SCALE</SectionTitle>
                  <Spacer />
                  <Spacer />
                  <Spacer />
                  <GradeColumns>
                    <GradeColumn>
                      <GradeBox grade="A">A</GradeBox>
                      <GradeRange>0-13</GradeRange>
                    </GradeColumn>
                    <GradeColumn>
                      <GradeBox grade="B">B</GradeBox>
                      <GradeRange>14-27</GradeRange>
                    </GradeColumn>
                    <GradeColumn>
                      <GradeBox grade="C">C</GradeBox>
                      <GradeRange>28+</GradeRange>
                    </GradeColumn>
                  </GradeColumns>
                </LegendSection>
                <Spacer />
                <Spacer />
                <Footer>
                  <SectionTitle>INFO</SectionTitle>
                  <Spacer />
                  <Spacer />
                  <FooterText>DATA FROM</FooterText>
                  <FooterText>DEPT OF HEALTH & MENTAL HYGIENE</FooterText>
                  <FooterText>VIA NYC OPEN DATA</FooterText>
                  <FooterText>{now.toLocaleDateString("en-US", { year: "numeric", month: "2-digit", day: "2-digit" })} {now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}</FooterText>
                  <FooterText>THANK YOU FOR DINING SAFELY</FooterText>
                </Footer>
                <Spacer />
                <Spacer />
              </EmptyState>
            )}
          </>
        )}

        {(selected || detailLoading) && (
          <Detail>
            <Spacer />
            {!detailLoading && <BackButton onClick={goBack}>&lt; BACK</BackButton>}
            {detailLoading && <BackButton style={{cursor: "default", color: GRAY}}>LOADING{dots(3)}</BackButton>}
            {selected && <Detail style={detailLoading ? {visibility: "hidden", height: 0, overflow: "hidden"} : undefined}>

            <Spacer />
            <Spacer />
            {selected.grade && GRADE_COLORS[selected.grade] && (
              <GradeReceipt>
                <GradeBig grade={selected.grade}>{GRADE_LABELS[selected.grade] || selected.grade}</GradeBig>
              </GradeReceipt>
            )}
            {(selected.grade === "Z" || selected.grade === "N") && (
              <>
                <Spacer />
                <Spacer />
                <GradeReceipt>
                  <GradeBig>?</GradeBig>
                  <Spacer />
                  <Spacer />
                  <GradePending>{selected.grade === "Z" ? "GRADE PENDING" : "NOT YET GRADED"}</GradePending>
                </GradeReceipt>
              </>
            )}

            <Spacer />
            <Spacer />
            <DetailName>{titleCase(selected.name)}</DetailName>
            <DetailLine>
              {selected.building} {selected.street}
            </DetailLine>
            <DetailLine>
              {BORO_NAMES[selected.boro] || selected.boro}{" "}
              {selected.zipcode}
            </DetailLine>
            <Spacer />
            <Spacer />
            <Spacer />

            {selected.gradeDate && (
              <GradeReceiptRow>
                <span>LAST GRADED</span>
                <LegendDots />
                <span>{formatDateShort(selected.gradeDate)}</span>
              </GradeReceiptRow>
            )}
            {selected.inspections.length > 0 && (
              <GradeReceiptRow>
                <span>LAST INSPECTED</span>
                <LegendDots />
                <span>{formatDateShort(selected.inspections[0].date)}</span>
              </GradeReceiptRow>
            )}
            {selected.inspections[0]?.score != null && selected.inspections[0]?.date !== selected.gradeDate && (
              <GradeReceiptRow>
                <span>ESTIMATED CURRENT GRADE</span>
                <LegendDots />
                <span>{estimateGrade(selected.inspections[0].score)}</span>
              </GradeReceiptRow>
            )}



            <Spacer />
            <Spacer />
            <Spacer />
            <SectionTitle>HISTORY</SectionTitle>

            {selected.inspections.map((insp, i) => (
              <InspectionBlock key={i}>
                <Spacer />
                <Spacer />
                <InspectionHeader>
                  <DateBadge>&nbsp;{formatDateShort(insp.date)}&nbsp;</DateBadge>
                  <InspectionMeta>
                    {insp.score != null && <span>&nbsp;{insp.score} POINTS{insp.grade && <>&nbsp;</>}</span>}
                    {insp.grade && <InspGrade grade={insp.grade}>&nbsp;{insp.grade === "Z" || insp.grade === "N" ? "?" : insp.grade}&nbsp;</InspGrade>}
                  </InspectionMeta>
                </InspectionHeader>
                <Spacer />
                {insp.violations.length > 0 ? (
                  <ViolationsList>
                    {[...insp.violations].sort((a, b) => b.critical - a.critical).map((v, j) => (
                      <React.Fragment key={j}>
                        {j > 0 && <Spacer />}
                        <ViolationItem>
                          <ViolationText critical={v.critical}>{v.critical && <><b>&nbsp;!&nbsp;</b>&nbsp;</>}{v.description.replace(/º/g, "°")}</ViolationText>
                        </ViolationItem>
                      </React.Fragment>
                    ))}
                  </ViolationsList>
                ) : (
                  <NoViolations>NO VIOLATIONS RECORDED</NoViolations>
                )}
              </InspectionBlock>
            ))}

            <Spacer />
            <Spacer />
            </Detail>}
          </Detail>
        )}
      </Paper>
    </Receipt>
  );
}

function dots(n) {
  return ".".repeat(n);
}

const MAX_KEYBOARD_PROPORTION = 0.52;

function preventIosKeyboardScroll(e) {
  if (!/iPad|iPhone|iPod/.test(navigator.userAgent)) return;
  if (
    (e.target.offsetTop + e.target.offsetHeight) / window.innerHeight >
    MAX_KEYBOARD_PROPORTION
  )
    return;

  const offset = document.body.scrollTop;
  document.body.style.top = offset * -1 + "px";
  document.body.classList.add("prevent-ios-focus-scrolling");

  setTimeout(() => {
    const savedOffset = parseInt(document.body.style.top, 10);
    document.body.classList.remove("prevent-ios-focus-scrolling");
    document.body.scrollTop = savedOffset * -1;
  }, 500);
}

function scoreToXs(score) {
  if (score <= 0) return 0;
  return Math.min(10, Math.ceil(score / 5));
}

function toSlug(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function titleCase(str) {
  if (!str) return "";
  return str
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDateShort(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
  }).toUpperCase();
}

function formatPhone(phone) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

function estimateGrade(score) {
  if (score == null) return null;
  if (score <= 13) return "A";
  if (score <= 27) return "B";
  return "C";
}

function timeAgo(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const now = new Date();
  const days = Math.floor((now - d) / (1000 * 60 * 60 * 24));
  const weeks = Math.floor(days / 7);
  if (weeks < 1) return "THIS WEEK";
  if (weeks === 1) return "1 WEEK AGO";
  return `${weeks} WEEKS AGO`;
}

// Styled Components

const GAP = "10px";
const LINE_HEIGHT = 1.4;

const Receipt = styled.div`
  background: #fff;
  line-height: ${LINE_HEIGHT};
  transition: opacity 0.3s ease;
`;

const Paper = styled.div`
  width: 100%;
  max-width: 600px;
  margin: 0 auto;
  padding: 16px 20px 32px;
  display: flex;
  flex-direction: column;
  gap: ${GAP};
`;

const ReceiptHeader = styled.div`
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: ${GAP};
`;

const StoreName = styled.h1`
  font-size: 28px;
  font-weight: 400;
  color: #111;
  margin: 0;
`;

const HeaderDetail = styled.div`
  font-size: 16px;
  color: #555;
`;

const Divider = styled.div`
  text-align: center;
  color: ${GRAY};
  font-size: 16px;
  margin: 0;  overflow: hidden;
  white-space: nowrap;
`;

const SearchWrap = styled.div`
  position: relative;
`;

const ClearButton = styled.button`
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  color: #666;
  font-size: 18px;
  font-family: "Home Video", "Courier New", Courier, monospace;
  cursor: pointer;
  padding: 4px;

  &:hover {
    color: #fff;
  }

  &:active {
    color: #fff;
  }
`;

const SearchBox = styled.input`
  width: 100%;
  padding: 14px 16px;
  font-size: 18px;
  font-family: "Home Video", "Courier New", Courier, monospace;
  border: none;
  outline: none;
  background: #111;
  color: #fff;  box-sizing: border-box;
  text-transform: uppercase;

  &::placeholder {
    color: #666;
  }
`;

const Status = styled.p`
  text-align: center;
  color: ${GRAY};
  margin: 0;
  font-size: 16px;
`;

const ResultCount = styled.p`
  font-size: 18px;
  color: #111;
  margin: 0;
  padding: 12px 0;
`;

const ResultsList = styled.div`
  display: flex;
  flex-direction: column;
`;

const ResultItem = styled.div``;

const ResultRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: ${GAP};
  padding: 12px 20px;
  margin: 0 -20px;
  cursor: pointer;

  &:hover {
    background: rgba(0, 0, 0, 0.04);
  }

  &:active {
    background: rgba(0, 0, 0, 0.08);
  }
`;

const ResultLeft = styled.div`
  display: flex;
  gap: ${GAP};
  flex: 1;
  min-width: 0;
`;

const ItemNumber = styled.span`
  font-size: 16px;
  color: ${GRAY};
  flex-shrink: 0;
  padding-top: 2px;
`;

const ResultDetails = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0;
`;

const ItemName = styled.div`
  font-size: 18px;
  color: #111;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding-top: 4px;
  padding-bottom: 0;
`;

const ItemMeta = styled.div`
  font-size: 16px;
  color: #777;
`;

const ScoreXs = styled.div`
  font-size: 16px;
  color: ${GRAY};
`;

const ItemAddress = styled.div`
  font-size: 16px;
  color: ${GRAY};
  text-transform: uppercase;  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const ResultRight = styled.div`
  display: flex;
  flex-shrink: 0;
`;

const GradeBox = styled.div`
  width: 60px;
  height: 60px;
  border: 4px solid ${(p) => GRADE_COLORS[p.grade] || "#111"};
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 36px;
  color: ${(p) => GRADE_COLORS[p.grade] || "#111"};
  flex-shrink: 0;
`;

const ScoreText = styled.div`
  font-size: 16px;
  color: ${GRAY};
`;

const ItemDivider = styled.div`
  border-bottom: 1px dotted #ccc;
`;

const EmptyState = styled.div`
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: ${GAP};
`;

const EmptyText = styled.p`
  color: ${GRAY};
  font-size: 16px;
  margin: 0;
`;

const GradeColumns = styled.div`
  display: flex;
  justify-content: space-around;
`;

const GradeColumn = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${GAP};
`;

const GradeRange = styled.div`
  font-size: 16px;
  color: ${GRAY};
`;

const LegendSection = styled.div`
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: ${GAP};
`;

const LegendTitle = styled.div`
  font-size: 18px;
  color: #555;
  margin: 0;  text-align: center;
`;

const LegendRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: 16px;
  color: #111;
`;

const LegendDots = styled.span`
  flex: 1;
  margin: 0 8px;
  margin: 0 8px;
  background: repeating-linear-gradient(to right, #ddd 0px, #ddd 2px, transparent 2px, transparent 8px);
  background-repeat: repeat-x;
  background-position: bottom;
  min-height: 2px;
  align-self: baseline;
`;

const LegendNote = styled.p`
  font-size: 16px;
  color: ${GRAY};
  text-align: center;
  margin: 0;
`;

// Detail view

const Spacer = styled.div`
  height: 1px;
`;

const Detail = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${GAP};
`;

const BackButton = styled.button`
  background: none;
  border: none;
  color: #555;
  font-size: 18px;
  font-family: "Home Video", "Courier New", Courier, monospace;
  cursor: pointer;
  padding: 0;  text-transform: uppercase;
  align-self: flex-start;

  &:hover {
    color: #111;
  }

  &:active {
    color: #000;
  }
`;

const DetailName = styled.h2`
  font-size: 22px;
  font-weight: 400;
  color: #111;
  margin: 0;
  text-align: center;
`;

const DetailLine = styled.div`
  font-size: 18px;
  color: ${GRAY};
  text-align: center;  text-transform: uppercase;
`;

const GradeReceipt = styled.div`
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${GAP};
`;

const GradeReceiptLabel = styled.div`
  font-size: 16px;
  color: ${GRAY};  margin: 0;
`;

const GradePending = styled.div`
  font-size: 40px;
  color: #111;
`;

const GradeBig = styled.div`
  font-size: 80px;
  color: ${(p) => GRADE_COLORS[p.grade] || "#111"};
  margin: 0 auto;
  width: 120px;
  height: 120px;
  border: 8px solid ${(p) => GRADE_COLORS[p.grade] || "#111"};
  display: flex;
  align-items: center;
  justify-content: center;
`;

const GradeReceiptRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: 18px;
  color: #111;
`;

const STAR_GAP = 22;

const SectionTitleRow = styled.h3`
  font-size: 18px;
  font-weight: 400;
  color: ${GRAY};
  margin: 0;
  text-align: center;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 0;
`;

function SectionTitle({ children }) {
  const ref = useRef(null);
  const textRef = useRef(null);
  const starRef = useRef(null);
  const [starCount, setStarCount] = useState(0);

  useEffect(() => {
    const el = ref.current;
    const textEl = textRef.current;
    const starEl = starRef.current;
    if (!el || !textEl || !starEl) return;
    const measure = () => {
      const totalWidth = el.offsetWidth;
      if (totalWidth === 0) return;
      const textWidth = textEl.offsetWidth;
      const starWidth = starEl.offsetWidth;
      const available = totalWidth - textWidth;
      const n = Math.floor((available + STAR_GAP) / (starWidth + STAR_GAP));
      setStarCount(Math.max(0, n - (n % 2)));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const leftCount = Math.ceil(starCount / 2);
  const rightCount = Math.floor(starCount / 2);

  return (
    <SectionTitleRow ref={ref}>
      <span ref={starRef} data-star style={starCount === 0 ? { position: 'absolute', visibility: 'hidden' } : undefined}>*</span>
      {Array.from({ length: Math.max(0, leftCount - 1) }, (_, i) => <span key={`l${i}`} data-star>*</span>)}
      <span ref={textRef}>{children}</span>
      {Array.from({ length: rightCount }, (_, i) => <span key={`r${i}`} data-star>*</span>)}
    </SectionTitleRow>
  );
}

const InspectionBlock = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${GAP};
`;

const DateBadge = styled.span`
  font-weight: 700;
  color: #111;
  -webkit-font-smoothing: none;
`;

const InspectionHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: 18px;
  color: #333;
`;

const InspectionMeta = styled.div`
  display: flex;
  gap: ${GAP};
  font-size: 18px;
  color: ${GRAY};
`;

const InspGrade = styled.span`
  color: ${(p) => GRADE_COLORS[p.grade] || "#111"};
  font-weight: 700;
  -webkit-font-smoothing: none;
`;

const ViolationsList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${GAP};
`;

const ViolationItem = styled.div`
  font-size: 18px;
  color: #444;
  display: flex;
  flex-direction: column;
  gap: 0;
`;

const ViolationFlag = styled.span`
  color: ${(p) => (p.critical ? "#DC2626" : GRAY)};
  margin-bottom: ${(p) => (p.critical ? 0 : "4px")};
`;

const ViolationText = styled.span`
  display: block;
  color: ${(p) => (p.critical ? "#DC2626" : "#111")};
  font-size: 18px;

  ${(p) => p.critical && `
    &::selection {
      background: #DC2626;
      color: #fff;
    }
  `}
`;

const NoViolations = styled.div`
  font-size: 18px;
  color: ${GRAY};
`;

const Footer = styled.footer`
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: ${GAP};
  padding-top: 2px;
`;

const FooterText = styled.div`
  font-size: 18px;
  color: ${GRAY};
`;

const Barcode = styled.div`
  font-size: 24px;  color: #111;
  margin-top: 14px;
`;

export default App;
