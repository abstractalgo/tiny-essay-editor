import { AutomergeUrl, isValidAutomergeUrl } from "@automerge/automerge-repo";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useDocument, useRepo } from "@automerge/automerge-repo-react-hooks";
import { Button } from "@/components/ui/button";
import {
  useCurrentAccount,
  useCurrentAccountDoc,
  useCurrentRootFolderDoc,
} from "../account";
import { DocType, docTypes } from "../doctypes";

import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { LoadingScreen } from "./LoadingScreen";
import { TinyEssayEditor } from "@/tee/components/TinyEssayEditor";
import { TLDraw } from "@/tldraw/components/TLDraw";

import queryString from "query-string";
import { setUrlHashForDoc } from "../utils";

export type Tool = {
  id: string;
  name: string;
  component: React.FC;
};

const TOOLS = {
  essay: [
    {
      id: "essay",
      name: "Editor",
      component: TinyEssayEditor,
    },
  ],
  tldraw: [
    {
      id: "tldraw",
      name: "Drawing",
      component: TLDraw,
    },
  ],
};

export const DocExplorer: React.FC = () => {
  const repo = useRepo();
  const currentAccount = useCurrentAccount();
  const [accountDoc, changeAccountDoc] = useCurrentAccountDoc();
  const [rootFolderDoc, changeRootFolderDoc] = useCurrentRootFolderDoc();

  const [showSidebar, setShowSidebar] = useState(true);

  const { selectedDoc, selectDoc, selectedDocUrl } = useSelectedDoc({
    rootFolderDoc,
    changeRootFolderDoc,
  });

  const selectedDocLink = rootFolderDoc?.docs.find(
    (doc) => doc.url === selectedDocUrl
  );

  const selectedDocName = selectedDocLink?.name;

  const availableTools = useMemo(
    () => (selectedDocLink ? TOOLS[selectedDocLink.type] : []),
    [selectedDocLink]
  );
  const [activeTool, setActiveTool] = useState(availableTools[0] ?? null);
  useEffect(() => {
    setActiveTool(availableTools[0]);
  }, [availableTools]);

  const ToolComponent = activeTool?.component;

  const addNewDocument = useCallback(
    ({ type }: { type: DocType }) => {
      if (!docTypes[type]) {
        throw new Error(`Unsupported document type: ${type}`);
      }

      const newDocHandle = repo.create();
      newDocHandle.change((doc) => docTypes[type].init(doc));

      if (!rootFolderDoc) {
        return;
      }

      changeRootFolderDoc((doc) =>
        doc.docs.unshift({
          type: type,
          name: "Untitled document",
          url: newDocHandle.url,
        })
      );

      // By updating the URL to the new doc, we'll trigger a navigation
      setUrlHashForDoc({ docUrl: newDocHandle.url, docType: type });
    },
    [changeRootFolderDoc, repo, rootFolderDoc]
  );

  // sync doc names up from TEE docs to the sidebar list.
  useEffect(() => {
    (async () => {
      if (selectedDoc === undefined || selectedDocLink === undefined) {
        return;
      }
      const title = await docTypes[selectedDocLink.type].getTitle(selectedDoc);

      changeRootFolderDoc((doc) => {
        const existingDocLink = doc.docs.find(
          (link) => link.url === selectedDocUrl
        );
        if (existingDocLink && existingDocLink.name !== title) {
          existingDocLink.name = title;
        }
      });
    })();
  }, [
    selectedDoc,
    selectedDocUrl,
    changeAccountDoc,
    rootFolderDoc,
    changeRootFolderDoc,
    selectedDocLink,
    repo,
  ]);

  // update tab title to be the selected doc
  useEffect(() => {
    document.title = selectedDocName ?? "Essay Editor"; // TODO: generalize beyond TEE
  }, [selectedDocName]);

  // keyboard shortcuts
  useEffect(() => {
    const keydownHandler = (event: KeyboardEvent) => {
      // toggle the sidebar open/closed when the user types cmd-backslash
      if (event.key === "\\" && event.metaKey) {
        setShowSidebar((prev) => !prev);
      }

      // if there's no document selected and the user hits enter, make a new document
      if (!selectedDocUrl && event.key === "Enter") {
        addNewDocument({ type: "essay" });
      }
    };

    window.addEventListener("keydown", keydownHandler);

    // Clean up listener on unmount
    return () => {
      window.removeEventListener("keydown", keydownHandler);
    };
  }, [addNewDocument, selectedDocUrl]);

  const deleteFromRootFolder = (id: string) => {
    const itemIndex = rootFolderDoc?.docs.findIndex((item) => item.url === id);
    if (itemIndex >= 0) {
      if (itemIndex < rootFolderDoc?.docs.length - 1) {
        selectDoc(rootFolderDoc?.docs[itemIndex + 1].url);
      } else if (itemIndex > 1) {
        selectDoc(rootFolderDoc?.docs[itemIndex - 1].url);
      } else {
        selectDoc(null);
      }
      changeRootFolderDoc((doc) => {
        doc.docs.splice(itemIndex, 1);
      });
    }
  };

  if (!accountDoc || !rootFolderDoc) {
    return (
      <LoadingScreen
        docUrl={currentAccount?.handle?.url}
        handle={currentAccount?.handle}
      />
    );
  }

  return (
    <div>
      <div className="flex flex-row w-screen h-screen overflow-hidden">
        <div
          className={`${
            showSidebar ? "w-64" : "w-0 translate-x-[-100%]"
          } flex-shrink-0 bg-gray-100 border-r border-gray-400 transition-all duration-100 overflow-hidden  `}
        >
          <Sidebar
            selectedDocUrl={selectedDocUrl}
            selectDoc={selectDoc}
            hideSidebar={() => setShowSidebar(false)}
            addNewDocument={addNewDocument}
          />
        </div>
        <div
          className={`flex-grow relative h-screen ${
            !selectedDocUrl ? "bg-gray-200" : ""
          }`}
        >
          <div className="flex flex-col h-screen">
            <Topbar
              showSidebar={showSidebar}
              setShowSidebar={setShowSidebar}
              selectedDocUrl={selectedDocUrl}
              selectDoc={selectDoc}
              deleteFromAccountDocList={deleteFromRootFolder}
              addNewDocument={addNewDocument}
            />
            <div className="flex-grow overflow-hidden z-0">
              {!selectedDocUrl && (
                <div className="flex items-center justify-center h-full text-gray-500">
                  <div>
                    <p className="text-center cursor-default select-none mb-4">
                      No document selected
                    </p>
                    <Button
                      onClick={() => addNewDocument({ type: "essay" })} // Default type for new document
                      variant="outline"
                    >
                      Create new document
                      <span className="ml-2">(&#9166;)</span>
                    </Button>
                  </div>
                </div>
              )}

              {/* NOTE: we set the URL as the component key, to force re-mount on URL change.
                If we want more continuity we could not do this. */}
              {selectedDocUrl && selectedDoc && ToolComponent && (
                <ToolComponent docUrl={selectedDocUrl} key={selectedDocUrl} />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export type UrlHashParams = {
  docUrl: AutomergeUrl;
  docType: DocType;
} | null;

const isDocType = (x: string): x is DocType =>
  Object.keys(docTypes).includes(x as DocType);

const parseCurrentUrlHash = (): UrlHashParams => {
  const hash = window.location.hash;

  // This is a backwards compatibility shim for old URLs where we
  // only had one parameter, the Automerge URL.
  // We just assume it's a TEE essay in that case.
  const possibleAutomergeUrl = hash.slice(1);
  if (isValidAutomergeUrl(possibleAutomergeUrl)) {
    return {
      docUrl: possibleAutomergeUrl,
      docType: "tldraw",
    };
  }

  // Now on to the main logic where we look for a url and type both.
  const parsedHash = queryString.parse(hash);
  const { docUrl, docType } = parsedHash;

  if (typeof docUrl !== "string" || typeof docType !== "string") {
    return null;
  }

  if (typeof docUrl === "string" && !isValidAutomergeUrl(docUrl)) {
    alert(`Invalid Automerge URL in URL: ${parsedHash.docUrl}`);
    return null;
  }

  if (typeof docType === "string" && !isDocType(docType)) {
    alert(`Invalid doc type in URL: ${docType}`);
    return null;
  }

  return {
    docUrl,
    docType,
  };
};

// Drive the currently selected doc using the URL hash
// (We encapsulate the selection state in a hook so that the only
// API for changing the selection is properly thru the URL)
const useSelectedDoc = ({ rootFolderDoc, changeRootFolderDoc }) => {
  const [selectedDocUrl, setSelectedDocUrl] = useState<AutomergeUrl>(null);
  const [selectedDoc] = useDocument(selectedDocUrl);

  const selectDoc = (docUrl: AutomergeUrl | null) => {
    const doc = rootFolderDoc.docs.find((doc) => doc.url === docUrl);
    if (!doc) {
      alert(`Could not find document with URL: ${docUrl}`);
      return;
    }
    setUrlHashForDoc({ docUrl, docType: doc.type });
  };

  // Add an existing doc to our collection
  const openDocFromUrl = useCallback(
    ({ docUrl, docType }: { docUrl: AutomergeUrl; docType: DocType }) => {
      if (!rootFolderDoc) {
        return;
      }

      // TODO: validate the doc's data schema here before adding to our collection
      if (!rootFolderDoc?.docs.find((doc) => doc.url === docUrl)) {
        changeRootFolderDoc((doc) =>
          doc.docs.unshift({
            type: docType,
            name: "Unknown document", // TODO: sync up the name once we load the data
            url: docUrl,
          })
        );
      }

      setSelectedDocUrl(docUrl);
    },
    [rootFolderDoc, changeRootFolderDoc, selectDoc]
  );

  // observe the URL hash to change the selected document
  useEffect(() => {
    const hashChangeHandler = () => {
      const urlParams = parseCurrentUrlHash();
      if (!urlParams) return;
      openDocFromUrl(urlParams);
    };

    hashChangeHandler();

    // Listen for hash changes
    window.addEventListener("hashchange", hashChangeHandler, false);

    // Clean up listener on unmount
    return () => {
      window.removeEventListener("hashchange", hashChangeHandler, false);
    };
  }, [openDocFromUrl]);

  return {
    selectedDocUrl,
    selectedDoc,
    selectDoc,
    openDocFromUrl,
  };
};
