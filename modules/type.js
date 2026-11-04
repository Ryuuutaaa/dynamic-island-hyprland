import Pango from 'gi://Pango';

// GTK3 CSS tidak mengenal font-feature-settings, jadi angka tabular dipasang
// lewat atribut Pango. Dipakai label jam/timer/statistik supaya lebarnya tidak
// bergeser saat digit berubah (mis. 11:11 -> 12:22).
export const tabular = label => {
    const attrs = Pango.AttrList.new();
    attrs.insert(Pango.attr_font_features_new('tnum 1'));
    label.attributes = attrs;
    return label;
};
