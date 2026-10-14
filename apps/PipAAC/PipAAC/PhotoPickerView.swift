//
//  PhotoPickerView.swift
//  PipAAC
//
//  Photos (044 E3): the word card's Picture row (PP-4: take or pick a
//  photo for a word) and the person photo in Settings (PP-8). Picking
//  uses PhotosPicker, so the iPad never asks for photo-library access;
//  the camera asks only when "Take a photo" is pressed (Info.plist
//  NSCameraUsageDescription). The photo is the adult's own picture:
//  never sent anywhere here. Where it is stored and recorded is
//  AppModel.setCardPhoto / setPersonPhoto - this file only captures.
//

import PhotosUI
import SwiftUI
import UIKit

/// The system camera. Present only where a camera exists.
struct CameraPicker: UIViewControllerRepresentable {
    let onImage: (UIImage) -> Void
    @Environment(\.dismiss) private var dismiss

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let p = UIImagePickerController()
        p.sourceType = .camera
        p.delegate = context.coordinator
        return p
    }
    func updateUIViewController(_ vc: UIImagePickerController, context: Context) {}
    func makeCoordinator() -> Coordinator { Coordinator(self) }

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let parent: CameraPicker
        init(_ p: CameraPicker) { parent = p }
        func imagePickerController(_ picker: UIImagePickerController,
                                   didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            if let img = info[.originalImage] as? UIImage { parent.onImage(img) }
            parent.dismiss()
        }
        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) { parent.dismiss() }
    }
}

/// Take or choose a photo; calls back with the image's bytes.
private struct PhotoSource: ViewModifier {
    @Binding var choosing: Bool
    @Binding var taking: Bool
    let onData: (Data) -> Void
    @State private var item: PhotosPickerItem?

    func body(content: Content) -> some View {
        content
            .photosPicker(isPresented: $choosing, selection: $item, matching: .images)
            .onChange(of: item) { _, picked in
                guard let picked else { return }
                item = nil
                NSLog("PipPhoto: picked an item")
                Task { @MainActor in
                    do {
                        if let d = try await picked.loadTransferable(type: Data.self) {
                            NSLog("PipPhoto: loaded \(d.count) bytes")
                            onData(d)
                        } else { NSLog("PipPhoto: no data") }
                    } catch { NSLog("PipPhoto: load failed \(error)") }
                }
            }
            .fullScreenCover(isPresented: $taking) {
                CameraPicker { img in
                    if let d = img.jpegData(compressionQuality: 1) { onData(d) }
                }
                .ignoresSafeArea()
            }
    }
}

private extension View {
    func photoSource(choosing: Binding<Bool>, taking: Binding<Bool>,
                     onData: @escaping (Data) -> Void) -> some View {
        modifier(PhotoSource(choosing: choosing, taking: taking, onData: onData))
    }
}

private let hasCamera = UIImagePickerController.isSourceTypeAvailable(.camera)

/// The dashed "📷 Photo" tile (index.html #wc-photolabel): a menu of
/// Take a photo / Choose a photo (only Choose where there is no camera).
private struct PhotoButton: View {
    let title: String
    let id: String
    @Binding var choosing: Bool
    @Binding var taking: Bool

    var body: some View {
        Group {
            if hasCamera {
                Menu {
                    Button("Take a photo") { taking = true }
                        .accessibilityIdentifier("\(id)-take")
                    Button("Choose a photo") { choosing = true }
                        .accessibilityIdentifier("\(id)-choose")
                } label: { label }
            } else {
                Button { choosing = true } label: { label }
                    .buttonStyle(.plain)
            }
        }
        .accessibilityLabel(title)
        .accessibilityIdentifier(id)
    }

    private var label: some View {
        Text("\u{1F4F7} \(title)")
            .font(.system(size: 16, weight: .semibold))
            .foregroundStyle(PipStyle.ink)
            .padding(.horizontal, 14).padding(.vertical, 10)
            .overlay(Capsule().strokeBorder(style: StrokeStyle(lineWidth: 1.5, dash: [5, 3]))
                .foregroundStyle(PipStyle.muted))
    }
}

/// The word card's Picture row (word-card-pictures.js, photo part only:
/// the finder and drawing are other slices).
struct CardPictureRow: View {
    @EnvironmentObject var model: AppModel
    let card: WordCardModel
    @State private var choosing = false
    @State private var taking = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Picture")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(PipStyle.muted)
            FlowRow {
                PhotoButton(title: "Photo", id: "wc-photo", choosing: $choosing, taking: $taking)
                if card.media?.canUseOurs == true {
                    Button { model.useOurPicture(card) } label: {
                        Text("Use our picture")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(PipStyle.ink)
                            .padding(.horizontal, 14).padding(.vertical, 10)
                            .background(Color.white)
                            .clipShape(Capsule())
                            .overlay(Capsule().stroke(PipStyle.muted.opacity(0.4), lineWidth: 1.5))
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("wc-useours")
                }
            }
        }
        .frame(maxWidth: 520, alignment: .leading)
        .photoSource(choosing: $choosing, taking: $taking) { data in
            model.setCardPhoto(card, imageData: data)
        }
    }
}

/// A person's round picture: their photo, else the first letter.
struct PersonAvatar: View {
    let person: PersonRecord
    var size: CGFloat = 44

    var body: some View {
        Group {
            if let key = person.photo, let ui = PipBlobs.image(forKey: key) {
                Image(uiImage: ui).resizable().scaledToFill()
            } else {
                Text(String(person.displayName.prefix(1)).uppercased())
                    .font(.system(size: size * 0.45, weight: .bold))
                    .foregroundStyle(PipStyle.ink)
                    .frame(width: size, height: size)
                    .background(Color.white)
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .overlay(Circle().stroke(PipStyle.ink.opacity(0.3), lineWidth: 1.5))
        .accessibilityHidden(true)
    }
}

/// Settings > the open person: their picture (person-card.js).
struct PersonPhotoSection: View {
    @EnvironmentObject var model: AppModel
    @State private var choosing = false
    @State private var taking = false

    private var me: PersonRecord? { model.people.first { $0.id == model.activeId } }

    var body: some View {
        if let me {
            Section {
                HStack(spacing: 14) {
                    PersonAvatar(person: me, size: 56)
                    VStack(alignment: .leading, spacing: 6) {
                        Text(me.displayName).font(.headline)
                        HStack(spacing: 10) {
                            PhotoButton(title: me.photo == nil ? "Add a photo" : "Change photo",
                                        id: "person-photo", choosing: $choosing, taking: $taking)
                            if me.photo != nil {
                                Button("Remove photo") { model.setPersonPhoto(imageData: nil) }
                                    .buttonStyle(.borderless)
                                    .accessibilityIdentifier("person-photo-rm")
                            }
                        }
                    }
                }
                .photoSource(choosing: $choosing, taking: $taking) { data in
                    model.setPersonPhoto(imageData: data)
                }
            } header: {
                Text("This person")
            }
        }
    }
}
